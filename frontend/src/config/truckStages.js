/**
 * Truck journey stages, in the order a truck passes them. Shared by Trucks in
 * yard, Truck journey and RFID readers so names and icons match everywhere.
 * `key` is the backend stage enum; `label` is the plain name shown to people.
 * `icon` names an entry in components/ui/icons.
 */

export const TRUCK_STAGES = [
  { key: 'ENTRY_GATE', label: 'Entry gate', hint: 'Truck arrives and is checked in', icon: 'gate' },
  { key: 'WEIGH_BRIDGE_1', label: 'Weighbridge (empty)', hint: 'Weighed before loading', icon: 'signal' },
  { key: 'LOADING_DOCK', label: 'Loading dock', hint: 'Material is loaded', icon: 'dock' },
  { key: 'WEIGH_BRIDGE_2', label: 'Weighbridge (loaded)', hint: 'Weighed after loading', icon: 'signal' },
  { key: 'INVOICE', label: 'Paperwork', hint: 'Invoice and documents', icon: 'document' },
  { key: 'PARKING', label: 'Parking', hint: 'Waiting inside the yard', icon: 'pin' },
  { key: 'EXIT_GATE', label: 'Exit gate', hint: 'Checked out and leaves', icon: 'truckOut' },
];

export const STAGE_BY_KEY = Object.fromEntries(TRUCK_STAGES.map((s, i) => [s.key, { ...s, index: i }]));

export const stageLabel = (key) => STAGE_BY_KEY[key]?.label || (key ? key.replace(/_/g, ' ').toLowerCase() : 'Entering');
