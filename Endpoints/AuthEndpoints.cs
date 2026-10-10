using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Timesheet.Data;
using Timesheet.Infrastructure;
using Timesheet.Models;
using Timesheet.Services;

namespace Timesheet.Endpoints;

// Registration with email verification, login, and password reset — the same
// flow as Mynt. Everyone verifies their address before the first login.
public static class AuthEndpoints
{
    private const int VerificationTokenValidityHours = 24;

    // Verified against when the email is unknown so login takes the same time
    // whether or not the account exists, preventing email enumeration by timing.
    private static readonly string DummyPasswordHash = BCrypt.Net.BCrypt.HashPassword("password-enumeration-guard");

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/login", async (LoginRequest request, ApplicationDbContext db, IConfiguration config, HttpContext context, ILoggerFactory loggerFactory) =>
        {
            var logger = loggerFactory.CreateLogger("Security");
            var ip = ClientIp.GetClientIp(context);
            var email = request.Email.Trim();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);

            if (user == null)
            {
                BCrypt.Net.BCrypt.Verify(request.Password, DummyPasswordHash);
                logger.LogWarning("Failed login: unknown email {Email} from {IP}", email, ip);
                return Results.Unauthorized();
            }

            if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            {
                logger.LogWarning("Failed login: wrong password for {Email} from {IP}", email, ip);
                return Results.Unauthorized();
            }

            if (user.EmailVerifiedAt == null)
                return Results.Json("email_not_verified", statusCode: StatusCodes.Status403Forbidden);

            user.LastSeenAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return Results.Ok(new { Token = GenerateJwtToken(user, config) });
        }).RequireRateLimiting("login");

        app.MapPost("/api/auth/register", async (RegisterRequest request, ApplicationDbContext db, IConfiguration config, EmailService emailService, ILoggerFactory loggerFactory) =>
        {
            if (request.Password.Length < 8)
                return Results.BadRequest("Lösenordet måste vara minst 8 tecken.");

            var email = request.Email.Trim();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);

            if (user != null)
            {
                if (user.EmailVerifiedAt != null)
                    return Results.BadRequest("E-postadressen är redan registrerad.");

                // Unverified account: re-send the link but keep the stored
                // password, so a second registration cannot take the account
                // over before the real owner verifies.
            }
            else
            {
                user = new User
                {
                    Email = email,
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                    TimeZone = UserEndpoints.IsValidTimeZone(request.TimeZone) ? request.TimeZone! : "Europe/Stockholm",
                };
                db.Users.Add(user);
            }

            var token = IssueVerificationToken(user);
            await db.SaveChangesAsync();
            await SendVerificationEmailAsync(emailService, config, loggerFactory, user, token);

            return Results.Ok(new { EmailVerificationRequired = true });
        }).RequireRateLimiting("register");

        app.MapPost("/api/auth/verify-email", async (VerifyEmailRequest request, ApplicationDbContext db, IConfiguration config) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Token))
                return Results.BadRequest("invalid_token");

            var email = request.Email.Trim();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
            if (user == null)
                return Results.BadRequest("invalid_token");

            // A second click is not an error, but it must not mint a session:
            // this endpoint is unauthenticated.
            if (user.EmailVerifiedAt != null)
                return Results.Ok(new { AlreadyVerified = true });

            if (user.EmailVerificationToken == null || user.EmailVerificationTokenExpiry <= DateTime.UtcNow)
                return Results.BadRequest("expired_token");

            if (!BCrypt.Net.BCrypt.Verify(request.Token, user.EmailVerificationToken))
                return Results.BadRequest("invalid_token");

            user.EmailVerifiedAt = DateTime.UtcNow;
            user.EmailVerificationToken = null;
            user.EmailVerificationTokenExpiry = null;
            user.LastSeenAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return Results.Ok(new { Token = GenerateJwtToken(user, config) });
        }).RequireRateLimiting("register");

        app.MapPost("/api/auth/resend-verification", async (EmailRequest request, ApplicationDbContext db, IConfiguration config, EmailService emailService, ILoggerFactory loggerFactory) =>
        {
            var email = request.Email.Trim();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);

            // Always OK to avoid email enumeration
            if (user == null || user.EmailVerifiedAt != null)
                return Results.Ok();

            var token = IssueVerificationToken(user);
            await db.SaveChangesAsync();
            await SendVerificationEmailAsync(emailService, config, loggerFactory, user, token);

            return Results.Ok();
        }).RequireRateLimiting("forgot-password");

        app.MapPost("/api/auth/forgot-password", async (EmailRequest request, ApplicationDbContext db, EmailService emailService, IConfiguration config) =>
        {
            var email = request.Email.Trim();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);

            // Always OK to avoid email enumeration
            if (user == null)
                return Results.Ok();

            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLower();
            user.PasswordResetToken = BCrypt.Net.BCrypt.HashPassword(token);
            user.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1);
            await db.SaveChangesAsync();

            var link = $"{config["AppUrl"]}/reset-password?token={token}&email={Uri.EscapeDataString(user.Email)}";
            await emailService.SendPasswordResetAsync(user.Email, link);

            return Results.Ok();
        }).RequireRateLimiting("forgot-password");

        app.MapPost("/api/auth/reset-password", async (ResetPasswordRequest request, ApplicationDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.Email))
                return Results.BadRequest("Länken är ogiltig eller har gått ut.");

            if (request.NewPassword.Length < 8)
                return Results.BadRequest("Lösenordet måste vara minst 8 tecken.");

            var email = request.Email.Trim();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email
                && u.PasswordResetToken != null && u.PasswordResetTokenExpiry > DateTime.UtcNow);

            if (user == null || !BCrypt.Net.BCrypt.Verify(request.Token, user.PasswordResetToken!))
                return Results.BadRequest("Länken är ogiltig eller har gått ut.");

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            user.PasswordResetToken = null;
            user.PasswordResetTokenExpiry = null;

            // Completing a reset proves mailbox control, which is what verification asks for.
            user.EmailVerifiedAt ??= DateTime.UtcNow;
            user.EmailVerificationToken = null;
            user.EmailVerificationTokenExpiry = null;

            await db.SaveChangesAsync();
            return Results.Ok();
        }).RequireRateLimiting("forgot-password");
    }

    // Generates a fresh verification token, stores only its hash on the user
    // and returns the clear-text value for the email link.
    private static string IssueVerificationToken(User user)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLower();
        user.EmailVerificationToken = BCrypt.Net.BCrypt.HashPassword(token);
        user.EmailVerificationTokenExpiry = DateTime.UtcNow.AddHours(VerificationTokenValidityHours);
        return token;
    }

    // A failing mail server must not cost the user their account — they can ask for a new link.
    private static async Task SendVerificationEmailAsync(EmailService emailService, IConfiguration config, ILoggerFactory loggerFactory, User user, string token)
    {
        var link = $"{config["AppUrl"]}/verify-email?token={token}&email={Uri.EscapeDataString(user.Email)}";
        try
        {
            await emailService.SendEmailVerificationAsync(user.Email, link);
        }
        catch (Exception ex)
        {
            loggerFactory.CreateLogger("Security").LogError(ex, "Failed to send verification email to {Email}", user.Email);
        }
    }

    private static string GenerateJwtToken(User user, IConfiguration config)
    {
        var key = new SymmetricSecurityKey(Convert.FromBase64String(
            config["Jwt:Key"] ?? throw new InvalidOperationException("JWT Key not found")));

        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"],
            audience: config["Jwt:Audience"],
            claims:
            [
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
            ],
            // Long-lived: a timer app you have to log into every day is one you stop using.
            expires: DateTime.UtcNow.AddDays(30),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public record LoginRequest(string Email, string Password);
    public record RegisterRequest(string Email, string Password, string? TimeZone);
    public record VerifyEmailRequest(string Email, string Token);
    public record EmailRequest(string Email);
    public record ResetPasswordRequest(string Email, string Token, string NewPassword);
}
