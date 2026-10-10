using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Timesheet.Data;
using Timesheet.Infrastructure;
using Timesheet.Models;

namespace Timesheet.Endpoints;

// Time entries and the running timer. Times travel as UTC instants; the
// frontend shows them in the browser's zone, the CSV in the user's TimeZone.
public static class TimeEntryEndpoints
{
    public static void MapTimeEntryEndpoints(this IEndpointRouteBuilder app)
    {
        var entries = app.MapGroup("/api/time-entries").RequireAuthorization();

        // Finished entries starting in [from, to). The running one is served by /api/timer.
        entries.MapGet("/", async (DateTime from, DateTime to, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var (f, t) = (Utc(from), Utc(to));
            return await ToDto(db.TimeEntries
                .Where(e => e.UserId == userId && e.End != null && e.Start >= f && e.Start < t)
                .OrderByDescending(e => e.Start))
                .ToListAsync();
        });

        entries.MapPost("/", async (EntryRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            if (request.End == null) return Results.BadRequest("Sluttid krävs.");

            var entry = new TimeEntry { UserId = userId };
            if (await Apply(entry, request, db, userId) is { } error) return error;

            db.TimeEntries.Add(entry);
            await db.SaveChangesAsync();
            return Results.Ok(await Load(db, entry.Id));
        });

        // Also edits the running entry (End stays null for that one).
        entries.MapPut("/{id:int}", async (int id, EntryRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var entry = await db.TimeEntries.Include(e => e.Tags).FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId);
            if (entry == null) return Results.NotFound();
            if (entry.End != null && request.End == null) return Results.BadRequest("Sluttid krävs.");

            if (await Apply(entry, request, db, userId) is { } error) return error;
            entry.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(await Load(db, entry.Id));
        });

        entries.MapDelete("/{id:int}", async (int id, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var deleted = await db.TimeEntries.Where(e => e.Id == id && e.UserId == userId).ExecuteDeleteAsync();
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });

        entries.MapGet("/export.csv", async (DateTime from, DateTime to, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var zone = await UserZone(db, userId);
            var (f, t) = (Utc(from), Utc(to));
            var rows = await ToDto(db.TimeEntries
                .Where(e => e.UserId == userId && e.End != null && e.Start >= f && e.Start < t)
                .OrderBy(e => e.Start))
                .ToListAsync();

            var csv = new StringBuilder("Datum,Start,Slut,Timmar,Projekt,Klient,Beskrivning,Taggar,Debiterbar\n");
            foreach (var e in rows)
            {
                var start = TimeZoneInfo.ConvertTimeFromUtc(e.Start, zone);
                var end = TimeZoneInfo.ConvertTimeFromUtc(e.End!.Value, zone);
                csv.AppendJoin(',',
                    start.ToString("yyyy-MM-dd"), start.ToString("HH:mm:ss"), end.ToString("HH:mm:ss"),
                    ((e.End.Value - e.Start).TotalHours).ToString("0.00", CultureInfo.InvariantCulture),
                    Csv(e.ProjectName), Csv(e.ClientName), Csv(e.Description),
                    Csv(string.Join(", ", e.Tags.Select(tag => tag.Name))), e.Billable ? "Ja" : "Nej");
                csv.Append('\n');
            }

            // BOM so Excel opens åäö correctly
            return Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(),
                "text/csv; charset=utf-8", "timesheet.csv");
        });

        var timer = app.MapGroup("/api/timer").RequireAuthorization();

        timer.MapGet("/", async (ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            return Results.Ok(new { Entry = await ToDto(db.TimeEntries.Where(e => e.UserId == userId && e.End == null)).FirstOrDefaultAsync() });
        });

        // Starting a timer stops the one already running, like Clockify.
        timer.MapPost("/start", async (EntryRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var now = DateTime.UtcNow;

            var entry = new TimeEntry { UserId = userId };
            if (await Apply(entry, request with { Start = now, End = null }, db, userId) is { } error) return error;

            // Two saves: the old timer must be stopped before the new row hits the
            // one-running-timer index.
            await using var tx = await db.Database.BeginTransactionAsync();
            var running = await db.TimeEntries.FirstOrDefaultAsync(e => e.UserId == userId && e.End == null);
            if (running != null)
            {
                running.End = now;
                running.UpdatedAt = now;
                await db.SaveChangesAsync();
            }

            db.TimeEntries.Add(entry);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(await Load(db, entry.Id));
        });

        timer.MapPost("/stop", async (ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var running = await db.TimeEntries.FirstOrDefaultAsync(e => e.UserId == userId && e.End == null);
            if (running == null) return Results.NotFound();

            running.End = DateTime.UtcNow;
            running.UpdatedAt = running.End.Value;
            await db.SaveChangesAsync();
            return Results.Ok(await Load(db, running.Id));
        });
    }

    private static async Task<IResult?> Apply(TimeEntry entry, EntryRequest request, ApplicationDbContext db, int userId)
    {
        var start = Utc(request.Start);
        var end = request.End is { } e ? Utc(e) : (DateTime?)null;
        if (end != null && end < start) return Results.BadRequest("Sluttiden ligger före starttiden.");

        if (request.ProjectId is { } projectId && !await db.Projects.AnyAsync(p => p.Id == projectId && p.UserId == userId))
            return Results.BadRequest("Okänt projekt.");

        var tagIds = request.TagIds ?? [];
        var tags = await db.Tags.Where(t => t.UserId == userId && tagIds.Contains(t.Id)).ToListAsync();
        if (tags.Count != tagIds.Distinct().Count()) return Results.BadRequest("Okänd tagg.");

        entry.Description = request.Description?.Trim() ?? "";
        entry.ProjectId = request.ProjectId;
        entry.Billable = request.Billable;
        entry.Start = start;
        entry.End = end;
        entry.Tags = tags;
        return null;
    }

    private static Task<EntryDto> Load(ApplicationDbContext db, int id) =>
        ToDto(db.TimeEntries.Where(e => e.Id == id)).FirstAsync();

    // Filter and sort before calling: EF cannot translate either on the projected record.
    private static IQueryable<EntryDto> ToDto(IQueryable<TimeEntry> query) =>
        query.Select(e => new EntryDto(
            e.Id, e.Description, e.Start, e.End, e.Billable,
            e.ProjectId, e.Project != null ? e.Project.Name : null, e.Project != null ? e.Project.Color : null,
            e.Project != null && e.Project.Client != null ? e.Project.Client.Name : null,
            e.Tags.OrderBy(t => t.Name).Select(t => new TagRef(t.Id, t.Name)).ToList()));

    public static async Task<TimeZoneInfo> UserZone(ApplicationDbContext db, int userId)
    {
        var id = await db.Users.Where(u => u.Id == userId).Select(u => u.TimeZone).FirstAsync();
        return TimeZoneInfo.TryFindSystemTimeZoneById(id, out var zone) ? zone : TimeZoneInfo.Utc;
    }

    // Npgsql only accepts UTC for timestamptz; requests may carry an offset.
    private static DateTime Utc(DateTime value) =>
        value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value.ToUniversalTime(), DateTimeKind.Utc);

    private static string Csv(string? value) =>
        string.IsNullOrEmpty(value) ? "" : $"\"{value.Replace("\"", "\"\"")}\"";

    public record TagRef(int Id, string Name);

    public record EntryDto(int Id, string Description, DateTime Start, DateTime? End, bool Billable,
        int? ProjectId, string? ProjectName, string? ProjectColor, string? ClientName, List<TagRef> Tags);

    public record EntryRequest(string? Description, int? ProjectId, List<int>? TagIds, bool Billable, DateTime Start, DateTime? End);
}
