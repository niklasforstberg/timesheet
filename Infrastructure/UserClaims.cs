using System.Security.Claims;

namespace Timesheet.Infrastructure;

public static class UserClaims
{
    /// <summary>The signed-in user's id. Only call behind RequireAuthorization.</summary>
    public static int UserId(this ClaimsPrincipal user) =>
        int.Parse(user.FindFirst(ClaimTypes.NameIdentifier)!.Value);
}
