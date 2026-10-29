using Timesheet.Services;

namespace Timesheet.Endpoints;

public static class HolidayEndpoints
{
    public static void MapHolidayEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/holidays").RequireAuthorization();

        group.MapGet("/{year:int}", (int year) =>
            year is < 1 or > 9999
                ? Results.BadRequest("Okänt år.")
                : Results.Ok(SwedishHolidays.For(year).OrderBy(h => h.Key).Select(h => new HolidayDto(h.Key, h.Value))));
    }

    public record HolidayDto(DateOnly Date, string Name);
}
