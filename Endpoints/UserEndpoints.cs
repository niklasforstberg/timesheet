using Microsoft.EntityFrameworkCore;
using Timesheet.Data;
using Timesheet.Infrastructure;

namespace Timesheet.Endpoints;

public static class UserEndpoints
{
    public static void MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/me").RequireAuthorization();

        group.MapGet("/", async (ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            return user == null
                ? Results.Unauthorized()
                : Results.Ok(new { user.Id, user.Email, user.TimeZone });
        });

        group.MapPut("/", async (UpdateMeRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            if (!IsValidTimeZone(request.TimeZone))
                return Results.BadRequest("Okänd tidszon.");

            var userId = context.User.UserId();
            var user = await db.Users.FirstAsync(u => u.Id == userId);
            user.TimeZone = request.TimeZone!;
            await db.SaveChangesAsync();
            return Results.Ok(new { user.Id, user.Email, user.TimeZone });
        });
    }

    public static bool IsValidTimeZone(string? id) =>
        !string.IsNullOrWhiteSpace(id) && TimeZoneInfo.TryFindSystemTimeZoneById(id, out _);

    public record UpdateMeRequest(string? TimeZone);
}
