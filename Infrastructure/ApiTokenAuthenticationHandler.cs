using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Timesheet.Data;
using Timesheet.Services;

namespace Timesheet.Infrastructure;

// Authenticates "Authorization: Bearer ts_..." personal access tokens.
// Used by the MCP endpoint; the JWT scheme still handles the SPA's own calls.
public class ApiTokenAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    ApplicationDbContext db)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "ApiToken";

    // LastUsedAt is only worth a write occasionally — an MCP session makes many
    // requests and the value is just for the user's own "last used" display.
    private static readonly TimeSpan LastUsedWriteInterval = TimeSpan.FromMinutes(5);

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (string.IsNullOrEmpty(header) || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.NoResult();

        var presented = header["Bearer ".Length..].Trim();
        if (!presented.StartsWith(ApiTokenService.Prefix, StringComparison.Ordinal))
            return AuthenticateResult.NoResult();

        var hash = ApiTokenService.Hash(presented);
        var token = await db.ApiTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash && t.RevokedAt == null);

        if (token?.User == null)
        {
            Logger.LogWarning("Rejected API token from {IP}", ClientIp.GetClientIp(Context));
            return AuthenticateResult.Fail("Invalid API token.");
        }

        if (token.LastUsedAt == null || DateTime.UtcNow - token.LastUsedAt > LastUsedWriteInterval)
        {
            token.LastUsedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, token.UserId.ToString()),
            new Claim(ClaimTypes.Email, token.User.Email),
        ], SchemeName);

        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }
}
