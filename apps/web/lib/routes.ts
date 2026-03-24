export const workspaceRoute = "/workspace";
export const dashboardRoute = "/dashboard";
export const projectRoute = (projectId: string) => `/projects/${projectId}`;
export const projectAdamRoute = (projectId: string) => `${projectRoute(projectId)}/adam`;
export const sceneReviewRoute = (projectId: string) => `${projectRoute(projectId)}/scenes`;
export const clipReviewRoute = (projectId: string) => `${projectRoute(projectId)}/clips`;
export const renderRoute = (projectId: string) => `${projectRoute(projectId)}/render`;
export const publishRoute = (projectId: string) => `${projectRoute(projectId)}/publish`;
