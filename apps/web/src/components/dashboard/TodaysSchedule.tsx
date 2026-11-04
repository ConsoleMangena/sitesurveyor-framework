import * as React from "react";
import { CalendarDays, MapPin, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { cn } from "@/lib/utils";
import { eventTypeDot, eventTypeLabel } from "@/lib/jobEventTypes.ts";
import type { JobEventRow } from "@/lib/repositories/jobEvents.ts";

interface TodaysScheduleProps {
  events: JobEventRow[];
  onNewDispatch?: () => void;
  maxItems?: number;
  footer?: React.ReactNode;
}

function parseMinutes(time: string | null): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function isAllDay(event: JobEventRow): boolean {
  return !event.start_time;
}

function getEventStatus(
  event: JobEventRow,
  nowMinutes: number,
): "past" | "current" | "upcoming" {
  if (isAllDay(event)) return "upcoming";
  const start = parseMinutes(event.start_time);
  const end = event.end_time ? parseMinutes(event.end_time) : null;
  if (start === null) return "upcoming";
  if (end !== null && nowMinutes > end) return "past";
  if (nowMinutes >= start && (end === null || nowMinutes < end)) return "current";
  return "upcoming";
}

function getStatusLabel(status: "past" | "current" | "upcoming"): string {
  switch (status) {
    case "current":
      return "In progress";
    case "past":
      return "Done";
    default:
      return "Upcoming";
  }
}

export function TodaysSchedule({
  events,
  onNewDispatch,
  maxItems = 6,
  footer,
}: TodaysScheduleProps) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const todaysEvents = React.useMemo(() => {
    return events
      .filter((event) => event.event_date === today)
      .sort((a, b) => {
        if (isAllDay(a) && !isAllDay(b)) return -1;
        if (!isAllDay(a) && isAllDay(b)) return 1;
        const aStart = parseMinutes(a.start_time) ?? Infinity;
        const bStart = parseMinutes(b.start_time) ?? Infinity;
        if (aStart !== bStart) return aStart - bStart;
        return (
          (parseMinutes(a.end_time) ?? Infinity) -
          (parseMinutes(b.end_time) ?? Infinity)
        );
      });
  }, [events, today]);

  const shownEvents = todaysEvents.slice(0, maxItems);
  const hiddenCount = todaysEvents.length - shownEvents.length;

  return (
    <DashboardCard
      className="h-full"
      title="Today&apos;s schedule"
      icon={<CalendarDays />}
      titleAction={
        onNewDispatch ? (
          <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={onNewDispatch}>
            <Plus className="size-3.5" />
            New dispatch
          </Button>
        ) : undefined
      }
      contentClassName="flex-1 flex flex-col gap-3"
    >
      {shownEvents.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No dispatches scheduled for today.
        </p>
      ) : (
        <>
          {hiddenCount > 0 ? (
            <p className="text-[11px] tabular-nums text-muted-foreground">
              Showing {shownEvents.length} of {todaysEvents.length}
            </p>
          ) : null}

          <div className="flex flex-col divide-y divide-border">
            {shownEvents.map((event) => {
              const status = getEventStatus(event, nowMinutes);

              return (
                <div
                  key={event.id}
                  className={cn(
                    "grid grid-cols-1 gap-2 py-2.5 transition-colors hover:bg-muted/30 sm:grid-cols-[4.5rem_1fr_auto] sm:items-center sm:gap-3",
                    status === "past" && "opacity-60",
                  )}
                >
                  <div className="text-[11px] leading-tight text-nowrap tabular-nums">
                    <div className="font-medium text-foreground">
                      {isAllDay(event) ? "All day" : event.start_time?.slice(0, 5)}
                    </div>
                    {!isAllDay(event) && event.end_time && (
                      <div className="text-muted-foreground">
                        {event.end_time.slice(0, 5)}
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="truncate font-medium text-sm leading-none text-foreground">
                      {event.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                      {event.location && (
                        <span className="flex min-w-0 items-center gap-1">
                          <MapPin className="size-3 shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            eventTypeDot(event.event_type),
                          )}
                        />
                        {eventTypeLabel(event.event_type)}
                      </span>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 rounded-md border-border/70 px-2 py-0.5 text-[11px] font-medium",
                      status === "current"
                        ? "border-success/40 text-success"
                        : "text-muted-foreground",
                    )}
                  >
                    {getStatusLabel(status)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </>
      )}

      {footer ? <div className="mt-1 border-t pt-2">{footer}</div> : null}
    </DashboardCard>
  );
}
