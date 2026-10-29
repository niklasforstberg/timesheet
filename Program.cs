using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Timesheet.Data;
using Timesheet.Endpoints;
using Timesheet.Infrastructure;
using Timesheet.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Dev only — in production the frontend is served from the same origin
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins("http://localhost:5174").AllowAnyMethod().AllowAnyHeader()));

// The SPA uses JWT; the MCP endpoint uses personal access tokens ("ts_..."),
// which the ApiToken scheme resolves against the database.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddScheme<AuthenticationSchemeOptions, ApiTokenAuthenticationHandler>(ApiTokenAuthenticationHandler.SchemeName, _ => { })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Convert.FromBase64String(
                builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured."))),
        };

        // JWT is the default scheme, so it sees the MCP endpoint's "ts_" tokens
        // too and would log a malformed-token exception for each. Skip those.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (context.Request.Headers.Authorization.ToString().StartsWith($"Bearer {ApiTokenService.Prefix}", StringComparison.Ordinal))
                    context.NoResult();
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// MCP server — read-only tools over Streamable HTTP at /mcp (see Mcp/TimesheetMcpTools.cs)
builder.Services.AddMcpServer()
    .WithHttpTransport()
    .WithToolsFromAssembly();

builder.Services.AddHealthChecks();

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")
        ?? Environment.GetEnvironmentVariable("DefaultConnection")
        ?? throw new InvalidOperationException("Connection string not found")));

builder.Services.AddScoped<EmailService>();
builder.Services.AddHttpClient<ClockifyImportService>(c => c.Timeout = TimeSpan.FromMinutes(2));
builder.Services.AddHttpContextAccessor();

builder.Services.AddRateLimiter(options =>
{
    void Limit(string name, int permits, TimeSpan window) =>
        options.AddPolicy(name, context => RateLimitPartition.GetFixedWindowLimiter(
            ClientIp.GetClientIp(context),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = window, QueueLimit = 0 }));

    Limit("login", 5, TimeSpan.FromMinutes(1));
    Limit("register", 5, TimeSpan.FromHours(1));
    Limit("forgot-password", 5, TimeSpan.FromMinutes(15));

    options.OnRejected = async (context, ct) =>
    {
        context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("Security")
            .LogWarning("Rate limit exceeded on {Path} from {IP}", context.HttpContext.Request.Path, ClientIp.GetClientIp(context.HttpContext));
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsync("För många försök. Vänta en stund.", ct);
    };
});

if (string.IsNullOrEmpty(builder.Configuration["AppUrl"]))
    throw new InvalidOperationException("AppUrl is not configured. Set it in appsettings or the AppUrl environment variable.");

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.Migrate();
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapApiTokenEndpoints();
app.MapClientEndpoints();
app.MapProjectEndpoints();
app.MapTagEndpoints();
app.MapTimeEntryEndpoints();
app.MapImportEndpoints();
app.MapTimebankEndpoints();
app.MapHolidayEndpoints();

// MCP clients authenticate with a personal access token, not the SPA's JWT
app.MapMcp("/mcp")
    .RequireAuthorization(policy => policy
        .AddAuthenticationSchemes(ApiTokenAuthenticationHandler.SchemeName)
        .RequireAuthenticatedUser());

app.MapHealthChecks("/health");

// Unknown /api paths are 404s, not the SPA
app.MapFallback("/api/{**rest}", () => Results.NotFound());
app.MapFallbackToFile("index.html");

app.Run();
