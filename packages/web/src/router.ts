import { lazy } from 'react';
import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';
import { App } from './app';

const GraphView = lazy(() =>
    import('./views/graph/graph-view').then((m) => ({
        default: m.GraphView,
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

const graphRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: GraphView,
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

const routeTree = rootRoute.addChildren([graphRoute, healthRoute, dnaRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}
