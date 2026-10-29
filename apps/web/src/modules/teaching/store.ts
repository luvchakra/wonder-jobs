"use client";
import { moduleStore } from "@/platform/moduleStore";
import type { TeacherProfile } from "./domain";

/** Teaching's own saves, responses, searches and profile (wj.m.teaching), separate from Jobs' stores. */
export const useTeachingStore = moduleStore("teaching");

/** The teacher's confirmed Teaching profile, or null until they save one. */
export const selectProfile = (s: { persona: Record<string, unknown> | null }) => s.persona as TeacherProfile | null;
