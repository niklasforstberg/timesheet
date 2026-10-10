using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Timesheet.Data;
using Timesheet.Models;

namespace Timesheet.Services;

// Copies a Clockify workspace into the user's data through Clockify's REST API
// (the API key works on the free plan). Rows are matched on ClockifyId, so
// running it again updates what changed in Clockify instead of duplicating.
// The API key is used for this request only and never stored.
public class ClockifyImportService(HttpClient http, ApplicationDbContext db)
{
    private const string BaseUrl = "https://api.clockify.me/api/v1";
    private const int PageSize = 200;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<List<ClockifyWorkspace>> GetWorkspacesAsync(string apiKey, CancellationToken ct) =>
        await GetAsync<List<ClockifyWorkspace>>(apiKey, "/workspaces", ct);

    public async Task<ImportResult> ImportAsync(int userId, string apiKey, string workspaceId, CancellationToken ct)
    {
        var me = await GetAsync<ClockifyUser>(apiKey, "/user", ct);
        var ws = $"/workspaces/{Uri.EscapeDataString(workspaceId)}";

        // Archived rows are asked for explicitly as well; DistinctBy covers the
        // case where the default listing already included them.
        var clients = await GetActiveAndArchivedAsync<ClockifyClient>(apiKey, $"{ws}/clients", ct);
        var projects = await GetActiveAndArchivedAsync<ClockifyProject>(apiKey, $"{ws}/projects", ct);
        var tags = await GetActiveAndArchivedAsync<ClockifyTag>(apiKey, $"{ws}/tags", ct);
        var entries = await GetAllPagesAsync<ClockifyTimeEntry>(apiKey, $"{ws}/user/{me.Id}/time-entries", ct);

        var clientMap = await db.Clients.Where(c => c.UserId == userId && c.ClockifyId != null).ToDictionaryAsync(c => c.ClockifyId!, ct);
        foreach (var c in clients)
        {
            if (!clientMap.TryGetValue(c.Id, out var client))
            {
                client = new Client { UserId = userId, Name = c.Name, ClockifyId = c.Id };
                db.Clients.Add(client);
                clientMap[c.Id] = client;
            }
            client.Name = c.Name;
            client.Archived = c.Archived;
        }

        var projectMap = await db.Projects.Where(p => p.UserId == userId && p.ClockifyId != null).ToDictionaryAsync(p => p.ClockifyId!, ct);
        foreach (var p in projects)
        {
            if (!projectMap.TryGetValue(p.Id, out var project))
            {
                project = new Project { UserId = userId, Name = p.Name, ClockifyId = p.Id };
                db.Projects.Add(project);
                projectMap[p.Id] = project;
            }
            project.Name = p.Name;
            project.Color = string.IsNullOrEmpty(p.Color) ? project.Color : p.Color;
            project.Billable = p.Billable;
            project.Archived = p.Archived;
            project.Client = p.ClientId != null && clientMap.TryGetValue(p.ClientId, out var client) ? client : null;
        }

        var tagMap = await db.Tags.Where(t => t.UserId == userId && t.ClockifyId != null).ToDictionaryAsync(t => t.ClockifyId!, ct);
        foreach (var t in tags)
        {
            if (!tagMap.TryGetValue(t.Id, out var tag))
            {
                tag = new Tag { UserId = userId, Name = t.Name, ClockifyId = t.Id };
                db.Tags.Add(tag);
                tagMap[t.Id] = tag;
            }
            tag.Name = t.Name;
            tag.Archived = t.Archived;
        }

        var entryMap = await db.TimeEntries.Include(e => e.Tags)
            .Where(e => e.UserId == userId && e.ClockifyId != null)
            .ToDictionaryAsync(e => e.ClockifyId!, ct);

        int created = 0, updated = 0, skippedRunning = 0;
        foreach (var e in entries)
        {
            // A timer still running in Clockify would clash with one running here.
            if (e.TimeInterval.End == null)
            {
                skippedRunning++;
                continue;
            }

            if (!entryMap.TryGetValue(e.Id, out var entry))
            {
                entry = new TimeEntry { UserId = userId, ClockifyId = e.Id };
                db.TimeEntries.Add(entry);
                entryMap[e.Id] = entry;
                created++;
            }
            else
            {
                updated++;
            }

            entry.Description = e.Description ?? "";
            entry.Start = e.TimeInterval.Start.UtcDateTime;
            entry.End = e.TimeInterval.End.Value.UtcDateTime;
            entry.Billable = e.Billable;
            entry.Project = e.ProjectId != null && projectMap.TryGetValue(e.ProjectId, out var project) ? project : null;
            entry.Tags = (e.TagIds ?? []).Where(tagMap.ContainsKey).Select(id => tagMap[id]).ToList();
            entry.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);

        return new ImportResult(clients.Count, projects.Count, tags.Count, created, updated, skippedRunning);
    }

    private async Task<List<T>> GetActiveAndArchivedAsync<T>(string apiKey, string path, CancellationToken ct) where T : IClockifyRow
    {
        var active = await GetAllPagesAsync<T>(apiKey, path, ct);
        var archived = await GetAllPagesAsync<T>(apiKey, $"{path}?archived=true", ct);
        return active.Concat(archived).DistinctBy(r => r.Id).ToList();
    }

    private async Task<List<T>> GetAllPagesAsync<T>(string apiKey, string path, CancellationToken ct)
    {
        var all = new List<T>();
        var separator = path.Contains('?') ? '&' : '?';
        for (var page = 1; ; page++)
        {
            var batch = await GetAsync<List<T>>(apiKey, $"{path}{separator}page={page}&page-size={PageSize}", ct);
            all.AddRange(batch);
            if (batch.Count < PageSize) return all;
        }
    }

    private async Task<T> GetAsync<T>(string apiKey, string path, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, BaseUrl + path);
        request.Headers.Add("X-Api-Key", apiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await http.SendAsync(request, ct);
        if (response.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
            throw new ClockifyException("Clockify godtog inte API-nyckeln.");
        if (!response.IsSuccessStatusCode)
            throw new ClockifyException($"Clockify svarade {(int)response.StatusCode} på {path}.");

        return await response.Content.ReadFromJsonAsync<T>(Json, ct)
            ?? throw new ClockifyException($"Tomt svar från Clockify på {path}.");
    }

    public interface IClockifyRow { string Id { get; } }

    public record ClockifyWorkspace(string Id, string Name);
    public record ClockifyUser(string Id, string? ActiveWorkspace);
    public record ClockifyClient(string Id, string Name, bool Archived) : IClockifyRow;
    public record ClockifyProject(string Id, string Name, string? ClientId, string? Color, bool Billable, bool Archived) : IClockifyRow;
    public record ClockifyTag(string Id, string Name, bool Archived) : IClockifyRow;
    public record ClockifyTimeEntry(string Id, string? Description, string? ProjectId, List<string>? TagIds, bool Billable,
        [property: JsonPropertyName("timeInterval")] ClockifyInterval TimeInterval);
    public record ClockifyInterval(DateTimeOffset Start, DateTimeOffset? End);

    public record ImportResult(int Clients, int Projects, int Tags, int EntriesCreated, int EntriesUpdated, int SkippedRunning);
}

public class ClockifyException(string message) : Exception(message);
