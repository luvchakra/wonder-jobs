"use client";
import { useEffect, useRef } from "react";
import { Bold, Italic, Heading2, List, type LucideIcon } from "lucide-react";
import { htmlToMarkdown, markdownToHtml } from "@/lib/richtext";
import { cn } from "@/lib/cn";

function ToolbarButton({ icon: Icon, label, command, value, disabled, onFormat }: { icon: LucideIcon; label: string; command: string; value?: string; disabled?: boolean; onFormat: (command: string, value?: string) => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      // Keeps the caret/selection in the editor — a normal button click would blur it first.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onFormat(command, value)}
      className="inline-flex size-7 items-center justify-center rounded-[8px] text-ink-3 hover:bg-surface hover:text-ink disabled:opacity-40"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

/**
 * A contentEditable rich-text surface for one artifact's markdown content.
 * Uncontrolled by design: innerHTML is only (re-)set imperatively when
 * `content` changes from *outside* this component (switching artifacts,
 * a regenerate, a restore) — never on every keystroke, or the browser's
 * own editing would fight a React re-render and the caret would jump.
 */
export function RichTextEditor({ content, onChange, disabled, ariaLabel }: { content: string; onChange: (markdown: string) => void; disabled?: boolean; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastKnown = useRef<string | null>(null);

  useEffect(() => {
    if (!ref.current || lastKnown.current === content) return;
    ref.current.innerHTML = markdownToHtml(content);
    lastKnown.current = content;
  }, [content]);

  const handleInput = () => {
    if (!ref.current) return;
    const markdown = htmlToMarkdown(ref.current);
    lastKnown.current = markdown;
    onChange(markdown);
  };

  const format = (command: string, value?: string) => {
    ref.current?.focus();
    try {
      document.execCommand(command, false, value);
    } catch {
      // Unsupported in this browser — the toolbar is a convenience, typing still works.
    }
    handleInput();
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-1 rounded-[10px] border border-line bg-surface-2 p-1" role="toolbar" aria-label={`Formatting for ${ariaLabel}`}>
        <ToolbarButton icon={Bold} label="Bold" disabled={disabled} onFormat={format} command="bold" />
        <ToolbarButton icon={Italic} label="Italic" disabled={disabled} onFormat={format} command="italic" />
        <ToolbarButton icon={Heading2} label="Heading" disabled={disabled} onFormat={format} command="formatBlock" value="H2" />
        <ToolbarButton icon={List} label="Bullet list" disabled={disabled} onFormat={format} command="insertUnorderedList" />
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        className={cn("min-h-[360px] rounded-[14px] border border-line bg-surface-2 p-4 text-[13.5px] leading-relaxed text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-400", "[&_h1]:mt-0 [&_h1]:text-[19px] [&_h1]:font-semibold [&_h1]:text-ink", "[&_h2]:mt-4 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:text-ink", "[&_h3]:mt-3 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-ink", "[&_p]:mt-2 [&_p:first-child]:mt-0", "[&_strong]:font-semibold [&_strong]:text-ink", "[&_hr]:my-3 [&_hr]:border-line", "[&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5", "[&_li]:mt-0.5")}
      />
    </div>
  );
}
