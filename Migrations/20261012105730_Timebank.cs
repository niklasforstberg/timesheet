using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Timesheet.Migrations
{
    /// <inheritdoc />
    public partial class Timebank : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TimebankOpeningMinutes",
                table: "Projects",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateOnly>(
                name: "TimebankStart",
                table: "Projects",
                type: "date",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TimebankTargets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    WeekStart = table.Column<DateOnly>(type: "date", nullable: false),
                    Minutes = table.Column<int>(type: "integer", nullable: false),
                    OnlyThisWeek = table.Column<bool>(type: "boolean", nullable: false),
                    Note = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimebankTargets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TimebankTargets_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TimebankTargets_ProjectId_WeekStart_OnlyThisWeek",
                table: "TimebankTargets",
                columns: new[] { "ProjectId", "WeekStart", "OnlyThisWeek" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TimebankTargets");

            migrationBuilder.DropColumn(
                name: "TimebankOpeningMinutes",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "TimebankStart",
                table: "Projects");
        }
    }
}
