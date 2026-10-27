/**
 * Navigation map — shared by the Sidebar, the TopHeader breadcrumb/title and
 * the page-jump search. Labels are plain language; `term` keeps the original
 * name for power users (shown as a tooltip / subtitle). Each item carries a
 * role group; only items the signed-in user may use are rendered.
 */

import { GROUPS } from './roles';
import { Icons } from '../components/ui/icons';

export const NAV_SECTIONS = [
  {
    id: 'today',
    label: 'Today',
    items: [
      { id: 'yard-map', to: '/yard-map', label: 'Yard map', term: 'Digital Yard Map', icon: Icons.map, roles: GROUPS.ANY, keywords: 'bays spots capacity overview' },
      { id: 'inbound', to: '/inbound', label: 'Receiving & storage', term: 'Inbound & Storage', icon: Icons.inbox, roles: GROUPS.ANY, keywords: 'lots batches materials receive bays layout' },
      { id: 'dispatch', to: '/dispatch', label: 'Outgoing trucks', term: 'Dispatch', icon: Icons.truckOut, roles: GROUPS.ANY, keywords: 'dispatch approve outbound' },
      { id: 'gate', to: '/gate', label: 'Exit gate', term: 'Gate Validation', icon: Icons.gate, roles: GROUPS.ANY, keywords: 'gate scan exit validation' },
    ],
  },
  {
    id: 'yard',
    label: 'Yard',
    items: [
      { id: 'trucks', to: '/trucks', label: 'Trucks in yard', term: 'Truck Operations', icon: Icons.truck, roles: GROUPS.ANY, keywords: 'visits journey turnaround' },
      { id: 'rfid', to: '/rfid', label: 'RFID readers', term: 'RFID Infrastructure', icon: Icons.rfid, roles: GROUPS.ANY, keywords: 'readers tags antenna' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    items: [
      { id: 'cameras', to: '/surveillance/cameras', label: 'Cameras', term: 'Camera Management', icon: Icons.camera, roles: GROUPS.ANY, keywords: 'cctv streams' },
      { id: 'live-monitoring', to: '/surveillance/live', label: 'Live view', term: 'Live Monitoring', icon: Icons.video, roles: GROUPS.ANY, keywords: 'video wall' },
      { id: 'surveillance-alerts', to: '/surveillance/alerts', label: 'Alerts', term: 'Surveillance Alerts', icon: Icons.bell, roles: GROUPS.ANY, keywords: 'motion intrusion events' },
      { id: 'face-registry', to: '/surveillance/faces', label: 'Face registry', term: 'Face Registry', icon: Icons.face, roles: GROUPS.ANY, keywords: 'employees enrolment' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { id: 'users', to: '/users', label: 'Users', term: 'User Management', icon: Icons.users, roles: GROUPS.USER_ADMIN, keywords: 'accounts roles' },
      { id: 'audit', to: '/audit', label: 'Activity log', term: 'Audit Logs', icon: Icons.document, roles: GROUPS.AUDIT_VIEW, keywords: 'audit history compliance' },
      { id: 'sap', to: '/sap-integration', label: 'SAP connection', term: 'SAP Integration', icon: Icons.database, roles: GROUPS.AUDIT_VIEW, keywords: 'sap sync erp' },
    ],
  },
];

/** Detail routes that aren't in the sidebar but need a title + parent. */
const DETAIL_ROUTES = [
  { prefix: '/trucks/journey/', label: 'Truck journey', parent: 'trucks' },
  { prefix: '/surveillance/cameras/', label: 'Camera details', parent: 'cameras' },
];

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items.map((i) => ({ ...i, section: s.label })));

/** Resolves the current path to { section, item, detail } for the header breadcrumb. */
export function resolveRoute(pathname) {
  const detail = DETAIL_ROUTES.find((d) => pathname.startsWith(d.prefix));
  if (detail) {
    const parent = ALL_ITEMS.find((i) => i.id === detail.parent);
    return { section: parent?.section, item: parent, detail: detail.label };
  }
  const item = ALL_ITEMS.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
  return { section: item?.section, item, detail: null };
}

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  SUPERVISOR: 'Supervisor',
  OPERATOR: 'Operator',
  MANAGER: 'Manager',
};
