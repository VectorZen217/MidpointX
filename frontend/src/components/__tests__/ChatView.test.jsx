import { render, screen } from '@testing-library/react';
import ChatView from '../ChatView';

const baseProps = {
  task: '', setTask: () => {}, handleStart: () => {}, isRunning: false,
  chatMessages: [], trace: [], tokenUsage: { input: 0, output: 0 },
  activeNode: 'idle', systemInfo: { model: 'TEST', persistence: 'local' },
  activeUser: { name: 'Test', uid: 'test' },
  clearChat: () => {}, pendingApproval: null, handleResume: () => {},
  executionMode: 'api', setExecutionMode: () => {},
};

test('renders empty state when no messages', () => {
  render(<ChatView {...baseProps} />);
  expect(screen.getByText('MidpointX Intelligence Active')).toBeInTheDocument();
});

test('user messages render as plain text', () => {
  const msgs = [{ sender: 'user', text: '**hello**', time: '10:00' }];
  render(<ChatView {...baseProps} chatMessages={msgs} />);
  expect(screen.getByText('**hello**')).toBeInTheDocument();
});

test('agent messages render Markdown bold', () => {
  const msgs = [{ sender: 'agent', text: '**hello**', time: '10:00' }];
  render(<ChatView {...baseProps} chatMessages={msgs} />);
  const bold = screen.getByText('hello');
  expect(bold.tagName).toBe('STRONG');
});

test('approval panel does NOT appear when pendingApproval is null', () => {
  render(<ChatView {...baseProps} />);
  expect(screen.queryByText('SECURITY CHALLENGE')).not.toBeInTheDocument();
});

test('floating approval panel appears when pendingApproval is set', () => {
  const approval = { tool: 'execute_system_command', args: { command: 'ls' } };
  render(<ChatView {...baseProps} pendingApproval={approval} />);
  expect(screen.getByText('SECURITY CHALLENGE')).toBeInTheDocument();
});
