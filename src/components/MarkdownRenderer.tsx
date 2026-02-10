/**
 * MarkdownRenderer -- Simple markdown renderer for task descriptions.
 *
 * Supports:
 * - Headings (h1-h6)
 * - Lists (ordered/unordered)
 * - Code blocks (inline and block)
 * - Links
 * - Bold/Italic
 * - Line breaks
 *
 * Does NOT require external dependencies - uses regex parsing.
 */
import React from "react";

interface MarkdownRendererProps {
	content: string;
	className?: string;
}

// Simple markdown parser (regex-based, no dependencies)
function parseMarkdown(text: string): React.ReactNode {
	if (!text) return null;

	const lines = text.split("\n");
	const elements: React.ReactNode[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line?.trim();
		if (!trimmed) {
			elements.push(<br key={`br-${i}`} />);
			i++;
			continue;
		}

		// Code block
		if (trimmed.startsWith("```")) {
			const codeLines: string[] = [];
			i++;
			while (i < lines.length) {
				const codeLine = lines[i];
				if (codeLine && codeLine.trim().startsWith("```")) break;
				codeLines.push(codeLine ?? "");
				i++;
			}
			elements.push(
				<div key={`code-${i}`} className="my-2 p-3 bg-(--color-surface) rounded-lg overflow-x-auto">
					<code className="text-sm font-mono text-(--color-text-primary)">
						{codeLines.join("\n")}
					</code>
				</div>
			);
			i++;
			continue;
		}

		// Headings
		const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			const level = headingMatch[1]?.length ?? 1;
			const content = parseInline(headingMatch[2] ?? "");
			let className = "font-bold my-2";
			if (level === 1) className += " text-xl";
			else if (level === 2) className += " text-lg";
			else className += " text-base";
			elements.push(
				<h2 key={`h-${i}`} className={className}>
					{content}
				</h2>
			);
			i++;
			continue;
		}

		// Unordered list
		if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
			const listItems: React.ReactNode[] = [];
			while (i < lines.length) {
				const listLine = lines[i];
				if (!listLine) break;
				const listTrimmed = listLine.trim();
				if (!listTrimmed.startsWith("- ") && !listTrimmed.startsWith("* ")) break;
				const content = parseInline(listTrimmed.slice(2));
				listItems.push(<li key={`li-${i}`} className="ml-4">{content}</li>);
				i++;
			}
			elements.push(<ul key={`ul-${i}`} className="my-2 list-disc">{listItems}</ul>);
			continue;
		}

		// Ordered list
		const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
		if (orderedMatch) {
			const listItems: React.ReactNode[] = [];
			while (i < lines.length) {
				const listLine = lines[i];
				if (!listLine) break;
				const orderedMatchInner = listLine.trim().match(/^\d+\.\s+(.+)$/);
				if (!orderedMatchInner) break;
				const content = parseInline(orderedMatchInner[1] ?? "");
				listItems.push(<li key={`oli-${i}`} className="ml-4">{content}</li>);
				i++;
			}
			elements.push(<ol key={`ol-${i}`} className="my-2 list-decimal">{listItems}</ol>);
			continue;
		}

		// Blockquote
		if (trimmed.startsWith("> ")) {
			const content = parseInline(trimmed.slice(2));
			elements.push(
				<blockquote key={`quote-${i}`} className="my-2 pl-4 border-l-2 border-(--color-border) italic text-(--color-text-muted)">
					{content}
				</blockquote>
			);
			i++;
			continue;
		}

		// Paragraph
		const content = parseInline(line ?? "");
		elements.push(<p key={`p-${i}`} className="my-1">{content}</p>);
		i++;
	}

	return <>{elements}</>;
}

// Parse inline markdown (bold, italic, code, links)
function parseInline(text: string): React.ReactNode {
	if (!text) return null;

	const parts: React.ReactNode[] = [];
	let remaining = text;
	let key = 0;

	while (remaining.length > 0) {
		// Code inline
		const codeMatch = remaining.match(/^`([^`]+)`/);
		if (codeMatch) {
			if (codeMatch.index && codeMatch.index > 0) {
				parts.push(remaining.slice(0, codeMatch.index));
			}
			parts.push(<code key={key++} className="px-1.5 py-0.5 bg-(--color-surface) rounded text-sm font-mono text-(--color-text-primary)">{codeMatch[1] ?? ""}</code>);
			remaining = remaining.slice((codeMatch.index ?? 0) + (codeMatch[0]?.length ?? 0));
			continue;
		}

		// Bold
		const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
		if (boldMatch) {
			if (boldMatch.index && boldMatch.index > 0) {
				parts.push(remaining.slice(0, boldMatch.index));
			}
			parts.push(<strong key={key++}>{boldMatch[1] ?? ""}</strong>);
			remaining = remaining.slice((boldMatch.index ?? 0) + (boldMatch[0]?.length ?? 0));
			continue;
		}

		// Italic
		const italicMatch = remaining.match(/\*(.+?)\*/);
		if (italicMatch) {
			if (italicMatch.index && italicMatch.index > 0) {
				parts.push(remaining.slice(0, italicMatch.index));
			}
			parts.push(<em key={key++}>{italicMatch[1] ?? ""}</em>);
			remaining = remaining.slice((italicMatch.index ?? 0) + (italicMatch[0]?.length ?? 0));
			continue;
		}

		// Link
		const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
		if (linkMatch) {
			if (linkMatch.index && linkMatch.index > 0) {
				parts.push(remaining.slice(0, linkMatch.index));
			}
			parts.push(
				<a key={key++} href={linkMatch[2] ?? ""} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
					{linkMatch[1] ?? ""}
				</a>
			);
			remaining = remaining.slice((linkMatch.index ?? 0) + (linkMatch[0]?.length ?? 0));
			continue;
		}

		// No more special markup found
		parts.push(remaining);
		break;
	}

	return <>{parts}</>;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
	return (
		<div className={`prose prose-sm max-w-none ${className}`}>
			{parseMarkdown(content)}
		</div>
	);
}
