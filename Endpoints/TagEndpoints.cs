using Microsoft.EntityFrameworkCore;
using Timesheet.Data;
using Timesheet.Infrastructure;
using Timesheet.Models;

namespace Timesheet.Endpoints;

public static class TagEndpoints
{
    public static void MapTagEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tags").RequireAuthorization();

        group.MapGet("/", async (ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            return await db.Tags.Where(t => t.UserId == userId)
                .OrderBy(t => t.Name)
                .Select(t => new TagDto(t.Id, t.Name, t.Archived))
                .ToListAsync();
        });

        group.MapPost("/", async (TagRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest("Namn krävs.");

            var tag = new Tag { UserId = context.User.UserId(), Name = request.Name.Trim(), Archived = request.Archived };
            db.Tags.Add(tag);
            await db.SaveChangesAsync();
            return Results.Ok(new TagDto(tag.Id, tag.Name, tag.Archived));
        });

        group.MapPut("/{id:int}", async (int id, TagRequest request, ApplicationDbContext db, HttpContext context) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest("Namn krävs.");

            var userId = context.User.UserId();
            var tag = await db.Tags.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
            if (tag == null) return Results.NotFound();

            tag.Name = request.Name.Trim();
            tag.Archived = request.Archived;
            await db.SaveChangesAsync();
            return Results.Ok(new TagDto(tag.Id, tag.Name, tag.Archived));
        });

        group.MapDelete("/{id:int}", async (int id, ApplicationDbContext db, HttpContext context) =>
        {
            var userId = context.User.UserId();
            var deleted = await db.Tags.Where(t => t.Id == id && t.UserId == userId).ExecuteDeleteAsync();
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    public record TagDto(int Id, string Name, bool Archived);
    public record TagRequest(string Name, bool Archived);
}
