using Microsoft.EntityFrameworkCore;
using Timesheet.Models;

namespace Timesheet.Data;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<ApiToken> ApiTokens => Set<ApiToken>();
    public DbSet<Client> Clients => Set<Client>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<TimeEntry> TimeEntries => Set<TimeEntry>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Email).HasMaxLength(256);
            e.Property(u => u.TimeZone).HasMaxLength(64);
        });

        b.Entity<ApiToken>(e =>
        {
            e.HasIndex(t => t.TokenHash).IsUnique();
            e.Property(t => t.Name).HasMaxLength(100);
            e.HasOne(t => t.User).WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Client>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(200);
            e.HasOne<User>().WithMany().HasForeignKey(c => c.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(c => new { c.UserId, c.ClockifyId }).IsUnique().HasFilter("\"ClockifyId\" IS NOT NULL");
        });

        b.Entity<Project>(e =>
        {
            e.Property(p => p.Name).HasMaxLength(200);
            e.Property(p => p.Color).HasMaxLength(9);
            e.HasOne<User>().WithMany().HasForeignKey(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(p => p.Client).WithMany(c => c.Projects).HasForeignKey(p => p.ClientId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(p => new { p.UserId, p.ClockifyId }).IsUnique().HasFilter("\"ClockifyId\" IS NOT NULL");
        });

        b.Entity<Tag>(e =>
        {
            e.Property(t => t.Name).HasMaxLength(100);
            e.HasOne<User>().WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(t => new { t.UserId, t.ClockifyId }).IsUnique().HasFilter("\"ClockifyId\" IS NOT NULL");
        });

        b.Entity<TimeEntry>(e =>
        {
            e.Property(t => t.Description).HasMaxLength(3000);
            e.HasOne<User>().WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.Project).WithMany().HasForeignKey(t => t.ProjectId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(t => t.Tags).WithMany(t => t.TimeEntries);
            e.HasIndex(t => new { t.UserId, t.Start });
            e.HasIndex(t => new { t.UserId, t.ClockifyId }).IsUnique().HasFilter("\"ClockifyId\" IS NOT NULL");
            // At most one running timer per user.
            e.HasIndex(t => t.UserId).IsUnique().HasFilter("\"End\" IS NULL").HasDatabaseName("IX_TimeEntries_UserId_Running");
        });
    }
}
