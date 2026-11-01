type OpenScreen = (input: { screenId: string; params?: Record<string, string> }) => void;

let openScreen: OpenScreen | null = null;

/** 状态条不经过模块页面，避免和侧栏登记绕成环。 */
export function bindShellNavigation(open: OpenScreen): void {
  openScreen = open;
}

export function clearShellNavigation(): void {
  openScreen = null;
}

export function openShellScreen(screenId: string): void {
  openScreen?.({ screenId });
}
