using Microsoft.EntityFrameworkCore;
using Timesheet.Data;
using Timesheet.Infrastructure;
using Timesheet.Models;
using Timesheet.Services;

namespace Timesheet.Endpoints;

// Per-project time banks: from TimebankStart, each week's tracked time on the
// project minus that week's target is added to the opening balance. Weeks run
// Monday–Sunday in the user's time zone; an entry counts in the week it starts.
// A scheduled target is spread over Monday–Friday and loses a fifth for each
// weekday that is a Swedish holiday; single-week exceptions are taken as given.
public static class TimebankEndpoints
{
    public static void MapTimebankEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/timebank").RequireAuthorization();

        group.MapGet("/", async (ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var zone = await TimeEntryEndpoints.UserZone(db, userId);
            var now = DateTime.UtcNow;
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(now, zone));
            var thisWeek = Monday(today);

            var projects = await db.Projects
                .Where(p => p.UserId == userId && p.TimebankStart != null)
                .OrderBy(p => p.Name)
                .ToListAsync();
            var ids = projects.Select(p => p.Id).ToList();
            var targets = await db.TimebankTargets.Where(t => ids.Contains(t.ProjectId)).ToListAsync();

            var firstUtc = projects.Count == 0 ? now : projects.Min(p => ToUtc(p.TimebankStart!.Value, zone));
            var entries = await db.TimeEntries
                .Where(e => e.UserId == userId && e.ProjectId != null && ids.Contains(e.ProjectId.Value) && e.Start >= firstUtc)
                .Select(e => new { ProjectId = e.ProjectId!.Value, e.Start, e.End })
                .ToListAsync();
            var seconds = entries
                .GroupBy(e => (e.ProjectId, Week: Monday(DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(e.Start, zone)))))
                .ToDictionary(g => g.Key, g => g.Sum(e => ((e.End ?? now) - e.Start).TotalSeconds));

            return projects.Select(p =>
            {
                var own = targets.Where(t => t.ProjectId == p.Id).ToList();
                var weeks = new List<WeekDto>();
                var balance = p.TimebankOpeningMinutes;
                var closed = balance;
                var projected = balance;
                for (var w = p.TimebankStart!.Value; w <= thisWeek; w = w.AddDays(7))
                {
                    var weekdays = Enumerable.Range(0, 5).Select(i => w.AddDays(i)).ToList();
                    var holidays = weekdays.Select(SwedishHolidays.Name).OfType<string>().ToList();
                    var workdays = weekdays.Where(d => SwedishHolidays.Name(d) == null).ToList();

                    var exception = own.FirstOrDefault(t => t.OnlyThisWeek && t.WeekStart == w);
                    var schedule = own.Where(t => !t.OnlyThisWeek && t.WeekStart <= w).MaxBy(t => t.WeekStart);
                    var target = exception?.Minutes ?? (int)Math.Round((schedule?.Minutes ?? 0) * workdays.Count / 5.0);
                    var worked = (int)Math.Round(seconds.GetValueOrDefault((p.Id, w)) / 60);
                    balance += worked - target;
                    if (w < thisWeek) closed = balance;
                    // The rest of the target spread evenly over the workdays after today.
                    projected = w < thisWeek || workdays.Count == 0
                        ? balance
                        : balance + (int)Math.Round((double)target * workdays.Count(d => d > today) / workdays.Count);
                    var note = exception?.Note is { Length: > 0 } n ? n : string.Join(", ", holidays);
                    weeks.Add(new WeekDto(w, target, worked, worked - target, balance, note, w == thisWeek));
                }
                weeks.Reverse();

                return new TimebankDto(p.Id, p.Name, p.Color, p.TimebankStart.Value, p.TimebankOpeningMinutes, closed, projected,
                    own.OrderByDescending(t => t.WeekStart).Select(t => new TargetDto(t.Id, t.WeekStart, t.Minutes, t.OnlyThisWeek, t.Note)).ToList(),
                    weeks);
            }).ToList();
        });

        // Creates or changes a project's bank.
        group.MapPut("/{projectId:int}", async (int projectId, BankRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId);
            if (project == null) return Results.NotFound();

            project.TimebankStart = Monday(request.Start);
            project.TimebankOpeningMinutes = request.OpeningMinutes;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapDelete("/{projectId:int}", async (int projectId, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId);
            if (project == null) return Results.NotFound();

            await db.TimebankTargets.Where(t => t.ProjectId == projectId).ExecuteDeleteAsync();
            project.TimebankStart = null;
            project.TimebankOpeningMinutes = 0;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // A second row for the same week and kind replaces the first.
        group.MapPost("/{projectId:int}/targets", async (int projectId, TargetRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            if (!await db.Projects.AnyAsync(p => p.Id == projectId && p.UserId == userId)) return Results.NotFound();
            if (request.Minutes < 0) return Results.BadRequest("Målet kan inte vara negativt.");

            var week = Monday(request.WeekStart);
            var target = await db.TimebankTargets.FirstOrDefaultAsync(t =>
                t.ProjectId == projectId && t.WeekStart == week && t.OnlyThisWeek == request.OnlyThisWeek);
            if (target == null)
            {
                target = new TimebankTarget { ProjectId = projectId, WeekStart = week, OnlyThisWeek = request.OnlyThisWeek };
                db.TimebankTargets.Add(target);
            }
            target.Minutes = request.Minutes;
            target.Note = request.Note?.Trim() ?? "";
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapDelete("/{projectId:int}/targets/{id:int}", async (int projectId, int id, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var deleted = await db.TimebankTargets
                .Where(t => t.Id == id && t.ProjectId == projectId && db.Projects.Any(p => p.Id == projectId && p.UserId == userId))
                .ExecuteDeleteAsync();
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    private static DateOnly Monday(DateOnly d) => d.AddDays(-(((int)d.DayOfWeek + 6) % 7));

    private static DateTime ToUtc(DateOnly d, TimeZoneInfo zone) =>
        TimeZoneInfo.ConvertTimeToUtc(d.ToDateTime(TimeOnly.MinValue), zone);

    public record BankRequest(DateOnly Start, int OpeningMinutes);
    public record TargetRequest(DateOnly WeekStart, int Minutes, bool OnlyThisWeek, string? Note);
    public record TargetDto(int Id, DateOnly WeekStart, int Minutes, bool OnlyThisWeek, string Note);

    /// <summary>BalanceMinutes is cumulative through this week, i.e. as if the week ended now for the current one.</summary>
    public record WeekDto(DateOnly WeekStart, int TargetMinutes, int WorkedMinutes, int DiffMinutes, int BalanceMinutes, string Note, bool Current);

    /// <summary>BalanceMinutes is the balance after the last finished week; ProjectedMinutes is where this
    /// week ends if the remaining workdays go to schedule.</summary>
    public record TimebankDto(int ProjectId, string ProjectName, string Color, DateOnly Start, int OpeningMinutes,
        int BalanceMinutes, int ProjectedMinutes, List<TargetDto> Targets, List<WeekDto> Weeks);
}
