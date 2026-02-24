/** Permissions display component for integration access rights */

export interface Permission {
	scope: string;
	description: string;
	granted: boolean;
}

export interface IntegrationPermissionsProps {
	permissions: Permission[];
	serviceName: string;
	onTogglePermission?: (scope: string) => void;
	readOnly?: boolean;
	className?: string;
}

const SCOPE_LABELS: Record<string, string> = {
	// Google Calendar/Google Tasks
	"calendar.readonly": "Read calendar events",
	"calendar.events": "Create and modify events",
	"tasks.readonly": "Read tasks",
	tasks: "Create and modify tasks",

	// Notion
	"notion.pages": "Access pages",
	"notion.blocks": "Read and modify blocks",
	"notion.users": "Access user information",

	// Linear
	"linear.read": "Read issues and projects",
	"linear.write": "Create and modify issues",
	"linear.comments": "Add comments",

	// GitHub
	"github.repo": "Access repository",
	"github.issues": "Read and write issues",
	"github.pr": "Manage pull requests",

	// Discord
	"discord.messages": "Send and read messages",
	"discord.webhooks": "Manage webhooks",

	// Slack
	"slack.chat": "Send messages",
	"slack.channels": "Access channel information",
	"slack.webhooks": "Manage webhooks",
};

function getScopeLabel(scope: string): string {
	return SCOPE_LABELS[scope] || scope;
}

function getScopeIcon(scope: string): string {
	if (scope.includes("read") || scope.includes("readonly")) {
		return "👁";
	}
	if (scope.includes("write") || scope.includes("create") || scope.includes("modify")) {
		return "✏";
	}
	if (scope.includes("delete")) {
		return "🗑";
	}
	if (scope.includes("admin") || scope.includes("manage")) {
		return "⚙";
	}
	return "•";
}

export function IntegrationPermissions({
	permissions,
	serviceName,
	onTogglePermission,
	readOnly = false,
	className = "",
}: IntegrationPermissionsProps) {
	const grantedCount = permissions.filter((p) => p.granted).length;
	const totalCount = permissions.length;

	return (
		<div className={`space-y-4 ${className}`}>
			{/* Header */}
			<div className="flex items-center justify-between">
				<h3 className="text-title-medium font-medium text-on-surface">{serviceName} Permissions</h3>
				<span className="text-sm text-on-surface-variant">
					{grantedCount} of {totalCount} granted
				</span>
			</div>

			{/* Permission list */}
			<div className="space-y-2">
				{permissions.map((permission) => (
					<div
						key={permission.scope}
						className={`
							flex items-start gap-3 p-3 rounded-lg border
							${
								permission.granted
									? "border-success bg-success-container bg-opacity-10"
									: "border-outline-variant bg-surface-variant"
							}
							`}
					>
						{/* Icon */}
						<span className="text-xl mt-0.5">{getScopeIcon(permission.scope)}</span>

						{/* Info */}
						<div className="flex-1 min-w-0">
							<div className="font-medium text-sm text-on-surface">
								{getScopeLabel(permission.scope)}
							</div>
							{permission.description && (
								<div className="text-xs text-on-surface-variant mt-0.5">
									{permission.description}
								</div>
							)}
							<code className="text-xs text-on-surface-variant opacity-70">{permission.scope}</code>
						</div>

						{/* Toggle */}
						{!readOnly && onTogglePermission && (
							<button
								type="button"
								onClick={() => onTogglePermission(permission.scope)}
								className={`
									relative inline-flex h-6 w-11 items-center rounded-full
									transition-colors duration-150 ease-out
									${permission.granted ? "bg-primary" : "bg-outline-variant"}
								`}
								aria-label={`Toggle ${permission.scope}`}
							>
								<span
									className={`
										inline-block h-5 w-5 rounded-full bg-white
										transform transition-transform duration-150 ease-out
										${permission.granted ? "translate-x-6" : "translate-x-0.5"}
									`}
								/>
							</button>
						)}

						{/* Status badge (read-only mode) */}
						{readOnly && (
							<span
								className={`
									inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
									${
										permission.granted
											? "bg-success text-on-success"
											: "bg-outline-variant text-on-surface-variant"
									}
								`}
							>
								{permission.granted ? "Granted" : "Denied"}
							</span>
						)}
					</div>
				))}
			</div>

			{/* Warning if no permissions granted */}
			{grantedCount === 0 && (
				<div className="p-3 rounded-lg bg-warning-container text-on-warning-container text-sm">
					⚠️ No permissions granted. {serviceName} will have limited functionality.
				</div>
			)}
		</div>
	);
}

/** Compact permissions summary pill */
export function PermissionsSummary({
	permissions,
	className = "",
}: {
	permissions: Permission[];
	className?: string;
}) {
	const grantedCount = permissions.filter((p) => p.granted).length;
	const totalCount = permissions.length;

	return (
		<div
			className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-variant ${className}`}
		>
			<span className="text-sm text-on-surface">
				<span className="font-medium">{grantedCount}</span>
				<span className="text-on-surface-variant">/</span>
				<span>{totalCount}</span>
				<span className="text-on-surface-variant">permissions</span>
			</span>
		</div>
	);
}

/** Permission category groups for organized display */
export interface PermissionCategory {
	name: string;
	permissions: Permission[];
}

export function GroupedPermissions({
	categories,
	serviceName,
	onTogglePermission,
	readOnly,
	className = "",
}: {
	categories: PermissionCategory[];
	serviceName: string;
	onTogglePermission?: (scope: string) => void;
	readOnly?: boolean;
	className?: string;
}) {
	return (
		<div className={`space-y-6 ${className}`}>
			{/* Header */}
			<div className="flex items-center justify-between pb-2 border-b border-outline">
				<h3 className="text-title-medium font-medium text-on-surface">{serviceName} Permissions</h3>
			</div>

			{/* Category groups */}
			{categories.map((category) => (
				<div key={category.name} className="space-y-2">
					<h4 className="text-sm font-medium text-on-surface-variant mt-4 first:mt-0">
						{category.name}
					</h4>
					{category.permissions.map((permission) => (
						<div
							key={permission.scope}
							className="flex items-center justify-between p-2 rounded hover:bg-surface-variant hover:bg-opacity-50"
						>
							<div className="flex-1">
								<div className="text-sm text-on-surface">{getScopeLabel(permission.scope)}</div>
								<code className="text-xs text-on-surface-variant opacity-60">
									{permission.scope}
								</code>
							</div>
							{!readOnly && onTogglePermission && (
								<button
									type="button"
									onClick={() => onTogglePermission(permission.scope)}
									className={`ml-4 relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
										permission.granted ? "bg-primary" : "bg-outline-variant"
									}`}
								>
									<span
										className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
											permission.granted ? "translate-x-5" : "translate-x-0.5"
										}`}
									/>
								</button>
							)}
						</div>
					))}
				</div>
			))}
		</div>
	);
}
