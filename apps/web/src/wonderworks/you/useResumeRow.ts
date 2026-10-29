"use client";
import { useEffect } from "react";
import { FileText } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useResumeFilesStore } from "@/store/resumeFiles";
import type { YouRow } from "./YouOverview";

/**
 * You's My Resume row, for every module (taken from Jobs' You): the résumés uploaded and the ones designed, which
 * every module's Apply and Generate Customized Resume use; it leads to My Resume to upload or update them.
 */
export function useResumeRow(): YouRow {
  const resumes = useCareerStore((s) => s.savedResumes.length);
  const files = useResumeFilesStore((s) => s.files.length);
  const loadFiles = useResumeFilesStore((s) => s.load);
  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);
  return { href: "/app/resume-studio", label: "My Resume", value: files || resumes ? [files ? `${files} uploaded` : "", resumes ? `${resumes} designed` : ""].filter(Boolean).join(" · ") : "None yet", icon: FileText };
}
