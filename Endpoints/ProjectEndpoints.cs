using Microsoft.EntityFrameworkCore;
using Timesheet.Data;
using Timesheet.Infrastructure;
using Timesheet.Models;

namespace Timesheet.Endpoints;

public static class ProjectEndpoints
{
    public static void MapProjectEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects").RequireAuthorization();

        group.MapGet("/", async (ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            return await db.Projects.Where(p => p.UserId == userId)
                .OrderBy(p => p.Name)
                .Select(p => new ProjectDto(p.Id, p.Name, p.Color, p.Billable, p.Archived, p.ClientId, p.Client != null ? p.Client.Name : null))
                .ToListAsync();
        });

        group.MapPost("/", async (ProjectRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            if (await Validate(request, db, userId) is { } error) return error;

            var project = new Project { UserId = userId, Name = "" };
            Apply(project, request);
            db.Projects.Add(project);
            await db.SaveChangesAsync();
            return Results.Ok(await Load(db, project.Id));
        });

        group.MapPut("/{id:int}", async (int id, ProjectRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
            if (project == null) return Results.NotFound();
            if (await Validate(request, db, userId) is { } error) return error;

            Apply(project, request);
            await db.SaveChangesAsync();
            return Results.Ok(await Load(db, project.Id));
        });

        // Entries keep their time; they just lose the project.
        group.MapDelete("/{id:int}", async (int id, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var deleted = await db.Projects.Where(p => p.Id == id && p.UserId == userId).ExecuteDeleteAsync();
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    private static async Task<IResult?> Validate(ProjectRequest request, ApplicationDbContext db, int userId)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest("Namn krävs.");
        if (request.ClientId is { } clientId && !await db.Clients.AnyAsync(c => c.Id == clientId && c.UserId == userId))
            return Results.BadRequest("Okänd klient.");
        return null;
    }

    private static void Apply(Project project, ProjectRequest request)
    {
        project.Name = request.Name.Trim();
        project.ClientId = request.ClientId;
        project.Color = string.IsNullOrWhiteSpace(request.Color) ? project.Color : request.Color;
        project.Billable = request.Billable;
        project.Archived = request.Archived;
    }

    private static Task<ProjectDto> Load(ApplicationDbContext db, int id) =>
        db.Projects.Where(p => p.Id == id)
            .Select(p => new ProjectDto(p.Id, p.Name, p.Color, p.Billable, p.Archived, p.ClientId, p.Client != null ? p.Client.Name : null))
            .FirstAsync();

    public record ProjectDto(int Id, string Name, string Color, bool Billable, bool Archived, int? ClientId, string? ClientName);
    public record ProjectRequest(string Name, int? ClientId, string? Color, bool Billable, bool Archived);
}
