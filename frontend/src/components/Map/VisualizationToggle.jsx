/**
 * VisualizationToggle Component
 *
 * Segmented switch between the geographic Map view and the schematic Grid
 * (yard layout) view. Pure UI — no business logic.
 *
 * Props:
 *   activeView  {'map'|'layout'} — the currently active view
 *   onChange    {function}       — called with 'map' or 'layout'
 */

import { SegmentedControl } from '../ui';
import { Icons } from '../ui/icons';

const VIEWS = [
  { value: 'map', label: 'Map', icon: Icons.map, title: 'Storage spots on the site map' },
  { value: 'layout', label: 'Grid', icon: Icons.grid, title: 'Storage spots grouped by yard area' },
];

function VisualizationToggle({ activeView, onChange }) {
  return <SegmentedControl options={VIEWS} value={activeView} onChange={onChange} ariaLabel="How to show the yard" />;
}

export default VisualizationToggle;
