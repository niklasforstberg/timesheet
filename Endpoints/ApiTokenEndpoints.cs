using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Timesheet.Data;
using Timesheet.Infrastructure;
using Timesheet.Models;
using Timesheet.Services;

namespace Timesheet.Endpoints;

// Personal access tokens for the MCP server. Managed from Settings with the
// normal JWT session — a token can never be used to mint another token.
public static class ApiTokenEndpoints
{
    private const int MaxTokensPerUser = 10;

    public static void MapApiTokenEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/api-tokens")
            .RequireAuthorization(policy => policy
                .AddAuthenticationSchemes(JwtBearerDefaults.AuthenticationScheme)
                .RequireAuthenticatedUser());

        group.MapGet("/", async (ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            return await db.ApiTokens
                .Where(t => t.UserId == userId && t.RevokedAt == null)
                .OrderByDescending(t => t.CreatedAt)
                .Select(t => new { t.Id, t.Name, t.Prefix, t.CreatedAt, t.LastUsedAt })
                .ToListAsync();
        });

        // The plaintext is returned exactly once
        group.MapPost("/", async (CreateApiTokenRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();

            var name = request.Name?.Trim();
            if (string.IsNullOrEmpty(name) || name.Length > 100)
                return Results.BadRequest("Namnet måste vara 1–100 tecken.");

            if (await db.ApiTokens.CountAsync(t => t.UserId == userId && t.RevokedAt == null) >= MaxTokensPerUser)
                return Results.BadRequest($"Du kan ha högst {MaxTokensPerUser} aktiva tokens. Återkalla en först.");

            var plaintext = ApiTokenService.Generate();
            var token = new ApiToken
            {
                UserId = userId,
                Name = name,
                TokenHash = ApiTokenService.Hash(plaintext),
                Prefix = ApiTokenService.DisplayPrefix(plaintext),
                CreatedAt = DateTime.UtcNow,
            };
            db.ApiTokens.Add(token);
            await db.SaveChangesAsync();

            return Results.Ok(new { token.Id, token.Name, token.Prefix, token.CreatedAt, Token = plaintext });
        });

        group.MapDelete("/{id:int}", async (int id, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var token = await db.ApiTokens.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId && t.RevokedAt == null);
            if (token == null) return Results.NotFound();

            token.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    public record CreateApiTokenRequest(string? Name);
}
