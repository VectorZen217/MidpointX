import { render, screen } from '@testing-library/react';
import SystemBar from '../SystemBar';

const base = {
  activeNode: 'idle',
  tokenUsage: { input: 0, output: 0 },
  systemInfo: { model: 'GEMINI-2.0-FLASH', persistence: 'local', provider: 'google' },
  isRunning: false,
  socketConnected: true,
};

test('shows IDLE when not running', () => {
  render(<SystemBar {...base} />);
  expect(screen.getByText('IDLE')).toBeInTheDocument();
});

test('shows RUNNING and node label when isRunning=true', () => {
  render(<SystemBar {...base} isRunning={true} activeNode="reflection" />);
  expect(screen.getByText('RUNNING')).toBeInTheDocument();
  expect(screen.getByText('REFLECTION')).toBeInTheDocument();
});

test('formats token counts with locale separators', () => {
  render(<SystemBar {...base} tokenUsage={{ input: 12450, output: 3812 }} />);
  expect(screen.getByText('12,450')).toBeInTheDocument();
  expect(screen.getByText('3,812')).toBeInTheDocument();
});

test('shows DISCONNECTED when socketConnected=false', () => {
  render(<SystemBar {...base} socketConnected={false} />);
  expect(screen.getByText('DISCONNECTED')).toBeInTheDocument();
});

test('estimates cost to 4 decimal places', () => {
  // google: 0.075/1M input + 0.30/1M output
  // 1M+1M = $0.3750
  render(<SystemBar {...base} tokenUsage={{ input: 1_000_000, output: 1_000_000 }} />);
  expect(screen.getByText('$0.3750')).toBeInTheDocument();
});

test('shows zero cost for local provider', () => {
  render(<SystemBar {...base} systemInfo={{ ...base.systemInfo, provider: 'local' }} tokenUsage={{ input: 999999, output: 999999 }} />);
  expect(screen.getByText('$0.0000')).toBeInTheDocument();
});
