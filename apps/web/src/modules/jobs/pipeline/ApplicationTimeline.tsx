"use client";
import { Bookmark, CalendarDays, FileCheck, Flag, Mail, MessageSquare, Search, Send, StickyNote } from "lucide-react";
import type { ApplicationEvent } from "@/domain/applications/types";
import { StageTimeline } from "@/wonderworks/pipeline/parts";

const ICONS = { discovered: Search, saved: Bookmark, prepared: FileCheck, submitted: Send, follow_up: Mail, recruiter_response: MessageSquare, interview: CalendarDays, outcome: Flag, note: StickyNote } as const;

/** Jobs' application timeline: WonderWorks' StageTimeline with an icon per event type. */
export function ApplicationTimeline({ events, className }: { events: ApplicationEvent[]; className?: string }) {
  return <StageTimeline className={className} events={events.map((e) => ({ id: e.id, at: e.at, title: e.title, detail: e.detail, icon: ICONS[e.type] }))} />;
}
