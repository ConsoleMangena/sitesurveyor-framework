import * as React from "react";
import { CalendarDays, CalendarX, MapPin, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { JobEventRow } from "@/lib/repositories/jobEvents.ts";

interface TodaysScheduleProps {
  events: JobEventRow[];
  onNewDispatch?: () => void;
  maxItems?: number;
  footer?: React.ReactNode;
}

function formatEventTypeLabel(type: string | null): string {
  if (!type) return "Event";
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getEventTypeColor(type: string | null): string {
  switch (type?.toLowerCase()) {
    case "field_work":
      return "bg-sky-500";
    case "delivery":
      return "bg-amber-500";
    case "meeting":
      return "bg-violet-500";
    case "calibration":
      return "bg-emerald-500";
    case "maintenance":
      return "bg-slate-500";
    case "survey":
      return "bg-indigo-500";
    default:
      return "bg-muted-foreground";
  }
}

function getEventTypeBadge(type: string | null): string {
  switch (type?.toLowerCase()) {
    case "field_work":
      return "border-sky-600/50 bg-sky-50 text-sky-700";
    case "delivery":
      return "border-amber-600/50 bg-amber-50 text-amber-700";
    case "meeting":
      return "border-violet-600/50 bg-violet-50 text-violet-700";
    case "calibration":
      return "border-emerald-600/50 bg-emerald-50 text-emerald-700";
    case "maintenance":
      return "border-slate-600/50 bg-slate-50 text-slate-700";
    case "survey":
      return "border-indigo-600/50 bg-indigo-50 text-indigo-700";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
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

function getStatusBadge(status: "past" | "current" | "upcoming"): string {
  switch (status) {
    case "current":
      return "border-green-600/50 bg-green-50 text-green-700";
    case "past":
      return "border-slate-600/50 bg-slate-50 text-slate-700";
    default:
      return "border-yellow-600/50 bg-yellow-50 text-yellow-700";
  }
}

function getStatusLabel(status: "past" | "current" | "upcoming"): string {
  switch (status) {
    case "current":
      return "In Progress";
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
        return (parseMinutes(a.end_time) ?? Infinity) - (parseMinutes(b.end_time) ?? Infinity);
      })
      .slice(0, maxItems);
  }, [events, today, maxItems]);

  const allDayCount = todaysEvents.filter(isAllDay).length;
  const timedCount = todaysEvents.length - allDayCount;
  const upcomingCount = todaysEvents.filter(
    (event) => getEventStatus(event, nowMinutes) === "upcoming",
  ).length;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarDays className="size-4" />
          Today&apos;s Schedule
        </CardTitle>
        {onNewDispatch ? (
          <CardAction>
            <Button size="sm" className="gap-1.5" onClick={onNewDispatch}>
              <Plus className="size-3.5" />
              New Dispatch
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4">
        {todaysEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CalendarX className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No dispatches today</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your crews do not have any events scheduled for today.
              </p>
            </div>
            {onNewDispatch && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onNewDispatch}>
                <Plus className="size-3.5" />
                Schedule dispatch
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            <p className="mb-3 text-xs text-muted-foreground">
              {todaysEvents.length} dispatch{todaysEvents.length === 1 ? "" : "es"}
              {timedCount > 0 && allDayCount > 0
                ? ` · ${timedCount} timed, ${allDayCount} all-day`
                : ""}
              {upcomingCount > 0 && ` · ${upcomingCount} upcoming`}
            </p>

            <div className="flex flex-col divide-y divide-border">
              {todaysEvents.map((event) => {
                const status = getEventStatus(event, nowMinutes);
                const typeColor = getEventTypeColor(event.event_type);
                const typeBadge = getEventTypeBadge(event.event_type);
                const statusBadge = getStatusBadge(status);

                return (
                  <div
                    key={event.id}
                    className={cn(
                      "grid grid-cols-1 gap-3 bg-card py-3 transition-colors hover:bg-muted/30 sm:grid-cols-[7rem_1fr_auto] sm:items-center",
                      status === "past" && "opacity-60",
                    )}
                  >
                    <div className="flex gap-2">
                      <div className={cn("w-1 shrink-0 rounded-md", typeColor)} />
                      <div className="text-nowrap text-xs">
                        <div className="font-medium text-foreground">
                          {isAllDay(event) ? "All day" : event.start_time?.slice(0, 5)}
                        </div>
                        {!isAllDay(event) && event.end_time && (
                          <div className="text-muted-foreground">{event.end_time.slice(0, 5)}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="truncate font-medium text-foreground text-sm leading-none">
                        {event.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">{event.location}</span>
                          </span>
                        )}
                        <Badge variant="outline" className={cn("shrink-0 text-[10px]", typeBadge)}>
                          {formatEventTypeLabel(event.event_type)}
                        </Badge>
                      </div>
                    </div>

                    <Badge variant="secondary" className={cn("shrink-0 rounded-md px-2.5 py-1 font-medium text-[10px]", statusBadge)}>
                      {getStatusLabel(status)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {footer ? <div className="mt-2 pt-2 border-t">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
