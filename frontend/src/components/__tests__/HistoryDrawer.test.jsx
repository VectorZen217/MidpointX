import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import HistoryDrawer from '../HistoryDrawer';

test('shows loading state initially', () => {
  global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
  render(<HistoryDrawer onSelectSession={() => {}} activeSessionId={null} />);
  expect(screen.getByText('Loading...')).toBeInTheDocument();
});

test('shows empty state when fetch returns 404', async () => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: false }));
  render(<HistoryDrawer onSelectSession={() => {}} activeSessionId={null} />);
  await waitFor(() => expect(screen.getByText(/No history yet/i)).toBeInTheDocument());
});

test('shows empty state when fetch returns empty array', async () => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
  render(<HistoryDrawer onSelectSession={() => {}} activeSessionId={null} />);
  await waitFor(() => expect(screen.getByText(/No history yet/i)).toBeInTheDocument());
});

test('renders session list when fetch succeeds', async () => {
  const sessions = [
    { id: 's1', title: 'Analyze bugs', timestamp: Date.now(), stepCount: 5, toolCount: 2 },
  ];
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(sessions) }));
  render(<HistoryDrawer onSelectSession={() => {}} activeSessionId={null} />);
  await waitFor(() => expect(screen.getByText('Analyze bugs')).toBeInTheDocument());
});
