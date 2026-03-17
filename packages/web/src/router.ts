import { lazy } from 'react';
import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';
import { App } from './app';

const BrainView = lazy(() =>
    import('./views/brain/brain-view').then((m) => ({
        default: m.BrainView,
    })),
);

const HealthView = lazy(() =>
    import('./views/health/health-view').then((m) => ({
        default: m.HealthView,
    })),
);

const DnaView = lazy(() =>
    import('./views/dna/dna-view').then((m) => ({
        default: m.DnaView,
    })),
);

const rootRoute = createRootRoute({ component: App });

const brainRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: BrainView,
});

const healthRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/health',
    component: HealthView,
});

const dnaRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dna',
    component: DnaView,
});

const routeTree = rootRoute.addChildren([brainRoute, healthRoute, dnaRoute]);

export const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}
