using System.ComponentModel;
using System.Globalization;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol;
using ModelContextProtocol.Server;
using Timesheet.Data;
using Timesheet.Endpoints;

namespace Timesheet.Mcp;

// Read-only access to the caller's time data for MCP clients. The caller is
// identified by the personal access token on the request (see
// ApiTokenAuthenticationHandler); every query is scoped to that user.
//
// Dates in and out are local to the user's time zone (Settings), so "which day"
// matches what the user sees. Shapes are flat on purpose — an agent reads them
// as text.
[McpServerToolType]
public static class TimesheetMcpTools
{
    private const int MaxEntries = 2000;

    [McpServerTool(Name = "list_time_entries", ReadOnly = true)]
    [Description("List time entries between two dates (inclusive, user's local time zone), newest first. "
               + "Optional filters match project, client or tag names (case-insensitive, partial) and description text. "
               + "A running timer is included with running=true and its duration up to now.")]
    public static async Task<object> ListTimeEntries(
        ApplicationDbContext db, IHttpContextAccessor http,
        [Description("First day, YYYY-MM-DD")] string from,
        [Description("Last day (inclusive), YYYY-MM-DD. Defaults to today.")] string? to = null,
        [Description("Filter on project name")] string? project = null,
        [Description("Filter on client name")] string? client = null,
        [Description("Filter on tag name")] string? tag = null,
        [Description("Filter on description text")] string? search = null,
        [Description("Max rows to return (default 500, max 2000)")] int limit = 500)
    {
        var (userId, zone) = await Caller(db, http);
        var range = Range(from, to, zone);
        var rows = await Load(db, userId, range, project, client, tag, search, Math.Clamp(limit, 1, MaxEntries));

        return new
        {
            timeZone = zone.Id,
            from = range.From, to = range.To,
            count = rows.Count,
            totalHours = Hours(rows.Sum(r => r.Duration.TotalHours)),
            entries = rows.Select(r => new
            {
                date = Local(r.Start, zone).ToString("yyyy-MM-dd"),
                start = Local(r.Start, zone).ToString("HH:mm"),
                end = r.End is { } end ? Local(end, zone).ToString("HH:mm") : null,
                hours = Hours(r.Duration.TotalHours),
                running = r.End == null,
                description = r.Description,
                project = r.Project,
                client = r.Client,
                tags = r.Tags,
                billable = r.Billable,
            }),
        };
    }

    [McpServerTool(Name = "get_time_summary", ReadOnly = true)]
    [Description("Total hours between two dates (inclusive, user's local time zone), grouped by "
               + "project, client, tag, description, day, week (ISO) or month. Filters work like list_time_entries. "
               + "An entry with several tags counts once per tag when grouping by tag.")]
    public static async Task<object> GetTimeSummary(
        ApplicationDbContext db, IHttpContextAccessor http,
        [Description("First day, YYYY-MM-DD")] string from,
        [Description("Last day (inclusive), YYYY-MM-DD. Defaults to today.")] string? to = null,
        [Description("project | client | tag | description | day | week | month")] string groupBy = "project",
        [Description("Filter on project name")] string? project = null,
        [Description("Filter on client name")] string? client = null,
        [Description("Filter on tag name")] string? tag = null,
        [Description("Filter on description text")] string? search = null)
    {
        var (userId, zone) = await Caller(db, http);
        var range = Range(from, to, zone);
        var rows = await Load(db, userId, range, project, client, tag, search, int.MaxValue);

        Func<Row, IEnumerable<string>> key = groupBy.ToLowerInvariant() switch
        {
            "project" => r => [r.Project ?? "(inget projekt)"],
            "client" => r => [r.Client ?? "(ingen klient)"],
            "tag" => r => r.Tags.Count == 0 ? ["(ingen tagg)"] : r.Tags,
            "description" => r => [string.IsNullOrWhiteSpace(r.Description) ? "(ingen beskrivning)" : r.Description],
            "day" => r => [Local(r.Start, zone).ToString("yyyy-MM-dd")],
            "week" => r => [IsoWeek(Local(r.Start, zone))],
            "month" => r => [Local(r.Start, zone).ToString("yyyy-MM")],
            _ => throw new McpException($"Unknown groupBy '{groupBy}'. Use project, client, tag, description, day, week or month."),
        };
        var byDate = groupBy is "day" or "week" or "month";

        var groups = rows
            .SelectMany(r => key(r).Select(k => (Key: k, Row: r)))
            .GroupBy(x => x.Key)
            .Select(g => new
            {
                key = g.Key,
                hours = Hours(g.Sum(x => x.Row.Duration.TotalHours)),
                billableHours = Hours(g.Where(x => x.Row.Billable).Sum(x => x.Row.Duration.TotalHours)),
                entries = g.Count(),
            });

        return new
        {
            timeZone = zone.Id,
            from = range.From, to = range.To,
            groupBy,
            totalHours = Hours(rows.Sum(r => r.Duration.TotalHours)),
            billableHours = Hours(rows.Where(r => r.Billable).Sum(r => r.Duration.TotalHours)),
            groups = byDate ? groups.OrderBy(g => g.key) : groups.OrderByDescending(g => g.hours),
        };
    }

    [McpServerTool(Name = "list_projects", ReadOnly = true)]
    [Description("The user's projects with client, billable flag and total tracked hours. Also lists clients and tags.")]
    public static async Task<object> ListProjects(
        ApplicationDbContext db, IHttpContextAccessor http,
        [Description("Include archived projects, clients and tags")] bool includeArchived = false)
    {
        var (userId, _) = await Caller(db, http);

        var projects = await db.Projects
            .Where(p => p.UserId == userId && (includeArchived || !p.Archived))
            .Select(p => new { p.Id, p.Name, Client = p.Client != null ? p.Client.Name : null, p.Billable, p.Archived })
            .ToListAsync();

        var durations = await db.TimeEntries
            .Where(e => e.UserId == userId && e.ProjectId != null && e.End != null)
            .Select(e => new { e.ProjectId, e.Start, e.End })
            .ToListAsync();
        var hours = durations.GroupBy(d => d.ProjectId!.Value)
            .ToDictionary(g => g.Key, g => g.Sum(d => (d.End!.Value - d.Start).TotalHours));

        return new
        {
            projects = projects.OrderBy(p => p.Name).Select(p => new
            {
                name = p.Name,
                client = p.Client,
                billable = p.Billable,
                archived = p.Archived,
                totalHours = Hours(hours.GetValueOrDefault(p.Id)),
            }),
            clients = await db.Clients.Where(c => c.UserId == userId && (includeArchived || !c.Archived))
                .OrderBy(c => c.Name).Select(c => c.Name).ToListAsync(),
            tags = await db.Tags.Where(t => t.UserId == userId && (includeArchived || !t.Archived))
                .OrderBy(t => t.Name).Select(t => t.Name).ToListAsync(),
        };
    }

    [McpServerTool(Name = "get_running_timer", ReadOnly = true)]
    [Description("The timer currently running, if any: what it is for and how long it has run.")]
    public static async Task<object> GetRunningTimer(ApplicationDbContext db, IHttpContextAccessor http)
    {
        var (userId, zone) = await Caller(db, http);
        var e = await db.TimeEntries
            .Where(t => t.UserId == userId && t.End == null)
            .Select(t => new
            {
                t.Start, t.Description, t.Billable,
                Project = t.Project != null ? t.Project.Name : null,
                Client = t.Project != null && t.Project.Client != null ? t.Project.Client.Name : null,
                Tags = t.Tags.Select(x => x.Name).ToList(),
            })
            .FirstOrDefaultAsync();

        if (e == null) return new { running = false };

        return new
        {
            running = true,
            started = Local(e.Start, zone).ToString("yyyy-MM-dd HH:mm"),
            hours = Hours((DateTime.UtcNow - e.Start).TotalHours),
            description = e.Description,
            project = e.Project,
            client = e.Client,
            tags = e.Tags,
            billable = e.Billable,
        };
    }

    private record Row(DateTime Start, DateTime? End, string Description, string? Project, string? Client, List<string> Tags, bool Billable)
    {
        public TimeSpan Duration => (End ?? DateTime.UtcNow) - Start;
    }

    private record DateRange(string From, string To, DateTime StartUtc, DateTime EndUtc);

    private static async Task<List<Row>> Load(ApplicationDbContext db, int userId, DateRange range,
        string? project, string? client, string? tag, string? search, int limit)
    {
        var q = db.TimeEntries.Where(e => e.UserId == userId && e.Start >= range.StartUtc && e.Start < range.EndUtc);

        if (!string.IsNullOrWhiteSpace(project))
            q = q.Where(e => e.Project != null && EF.Functions.ILike(e.Project.Name, $"%{project}%"));
        if (!string.IsNullOrWhiteSpace(client))
            q = q.Where(e => e.Project != null && e.Project.Client != null && EF.Functions.ILike(e.Project.Client.Name, $"%{client}%"));
        if (!string.IsNullOrWhiteSpace(tag))
            q = q.Where(e => e.Tags.Any(t => EF.Functions.ILike(t.Name, $"%{tag}%")));
        if (!string.IsNullOrWhiteSpace(search))
            q = q.Where(e => EF.Functions.ILike(e.Description, $"%{search}%"));

        return await q
            .OrderByDescending(e => e.Start)
            .Take(limit)
            .Select(e => new Row(e.Start, e.End, e.Description,
                e.Project != null ? e.Project.Name : null,
                e.Project != null && e.Project.Client != null ? e.Project.Client.Name : null,
                e.Tags.OrderBy(t => t.Name).Select(t => t.Name).ToList(),
                e.Billable))
            .ToListAsync();
    }

    private static async Task<(int UserId, TimeZoneInfo Zone)> Caller(ApplicationDbContext db, IHttpContextAccessor http)
    {
        var claim = http.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(claim, out var userId))
            throw new McpException("Not authenticated.");
        return (userId, await TimeEntryEndpoints.UserZone(db, userId));
    }

    private static DateRange Range(string from, string? to, TimeZoneInfo zone)
    {
        var first = ParseDate(from);
        var last = to == null ? DateOnly.FromDateTime(Local(DateTime.UtcNow, zone)) : ParseDate(to);
        if (last < first) throw new McpException("'to' is before 'from'.");

        return new DateRange(first.ToString("yyyy-MM-dd"), last.ToString("yyyy-MM-dd"),
            TimeZoneInfo.ConvertTimeToUtc(first.ToDateTime(TimeOnly.MinValue), zone),
            TimeZoneInfo.ConvertTimeToUtc(last.AddDays(1).ToDateTime(TimeOnly.MinValue), zone));
    }

    private static DateOnly ParseDate(string value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d
            : throw new McpException($"Invalid date '{value}'. Use YYYY-MM-DD.");

    private static DateTime Local(DateTime utc, TimeZoneInfo zone) => TimeZoneInfo.ConvertTimeFromUtc(utc, zone);

    private static string IsoWeek(DateTime d) => $"{ISOWeek.GetYear(d)}-W{ISOWeek.GetWeekOfYear(d):00}";

    private static double Hours(double hours) => Math.Round(hours, 2);
}
