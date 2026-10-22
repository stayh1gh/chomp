import { useState } from 'react';
import { Button } from './components/Button';
import { Badge } from './components/Badge';
import { Card } from './components/Card';
import { Dialog } from './components/Dialog';
import { Select } from './components/Select';
import { Toast } from './components/Toast';
import { SidebarNav } from './components/SidebarNav';
import { Column } from './components/Column';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <h2 className="text-[length:var(--type-heading-font-size)] font-semibold text-[var(--semantic-ink-strong)] mb-2 pb-3 border-b border-[var(--semantic-border)]">
        {title}
      </h2>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[length:var(--type-overline-font-size)] font-semibold text-[var(--semantic-ink-subtle)] mb-2 uppercase tracking-wide">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function App() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fullDialogOpen, setFullDialogOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastVariant, setToastVariant] = useState<'default' | 'error'>('default');
  const [model, setModel] = useState('opus');

  return (
    <div className="min-h-screen bg-[var(--semantic-canvas)] text-[var(--semantic-ink-strong)] p-10 font-[family-name:var(--font-family-default)]">
      <h1 className="text-[length:var(--type-display-font-size)] font-semibold mb-1">
        Chomp Dashboard — Component Gallery
      </h1>
      <p className="text-[length:var(--type-caption-font-size)] text-[var(--semantic-ink-muted)] mb-12">
        Every built component, all appearances/sizes/states, for design review.
      </p>

      <Section title="Button">
        <Row label="Appearance — default size">
          <Button appearance="primary">Primary</Button>
          <Button appearance="secondary">Secondary</Button>
          <Button appearance="ghost">Ghost</Button>
        </Row>
        <Row label="Sizes">
          <Button size="default">Default</Button>
          <Button size="sm">Small</Button>
          <Button size="icon" aria-label="Add">
            +
          </Button>
        </Row>
        <Row label="Disabled">
          <Button appearance="primary" isDisabled>
            Primary
          </Button>
          <Button appearance="secondary" isDisabled>
            Secondary
          </Button>
        </Row>
        <Row label="Approve-ghost (card footer only)">
          <div className="w-56 bg-[var(--semantic-surface-card)] rounded-[var(--semantic-radius-lg)] p-3 pt-3 flex flex-col gap-2">
            <p className="m-0 text-sm text-[var(--semantic-ink)]">Card with footer</p>
            <div className="border-t border-[var(--semantic-divider)] -mx-3">
              <Button appearance="approve-ghost">Approve</Button>
            </div>
          </div>
        </Row>
      </Section>

      <Section title="Badge">
        <Row label="Status (mutually exclusive)">
          <Badge variant="running">Running</Badge>
          <Badge variant="user">Waiting for User</Badge>
          <Badge variant="approval">Waiting for Approval</Badge>
          <Badge variant="done">Done</Badge>
        </Row>
        <Row label="Metadata (additive)">
          <Badge variant="outline">v1.2.0</Badge>
          <Badge variant="gate">Queued</Badge>
          <Badge variant="warn">Config gap</Badge>
          <Badge variant="model">opus</Badge>
        </Row>
      </Section>

      <Section title="Card">
        <Row label="Minimal">
          <div className="w-80">
            <Card title="Net-new component audit" meta="Plan · 2 of 4" onClick={() => {}} />
          </div>
        </Row>
        <Row label="Full anatomy (description, tags, footer)">
          <div className="w-80">
            <Card
              title="Meter — low step polish"
              meta="Refinement · 1 of 3"
              description="Tighten the low-fill meter state so it reads clearly at 4–8% without looking broken — add a floor width and adjust the label position."
              tags={
                <>
                  <Badge variant="gate">Queued</Badge>
                  <Badge variant="model">sonnet</Badge>
                </>
              }
              footer={<Button appearance="approve-ghost">Approve</Button>}
              onClick={() => {}}
            />
          </div>
        </Row>
      </Section>

      <Section title="Select">
        <Row label="States">
          <Select
            aria-label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            options={[
              { label: 'Opus', value: 'opus' },
              { label: 'Sonnet', value: 'sonnet' },
              { label: 'Haiku', value: 'haiku' },
            ]}
          />
          <Select aria-label="Model (disabled)" isDisabled options={[{ label: 'Opus', value: 'opus' }]} />
        </Row>
      </Section>

      <Section title="Dialog">
        <Row label="Sizes">
          <Button appearance="secondary" onClick={() => setDialogOpen(true)}>
            Open small dialog
          </Button>
          <Button appearance="secondary" onClick={() => setFullDialogOpen(true)}>
            Open full-page dialog
          </Button>
        </Row>
        <Dialog
          isOpen={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="New Task"
          description="Create a new run for this profile."
          size="sm"
          footer={
            <>
              <Button appearance="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={() => setDialogOpen(false)}>
                Create
              </Button>
            </>
          }
        >
          <label className="block text-[length:var(--type-caption-font-size)] text-[var(--semantic-ink-muted)] mb-1">
            Title
          </label>
          <input
            className="w-full bg-[var(--semantic-bg-input)] border border-[var(--semantic-border)] rounded-[var(--semantic-radius-md)] text-[var(--semantic-ink-strong)] px-2.5 py-2 text-[length:var(--type-label-font-size)]"
            placeholder="Meter — low step polish"
          />
        </Dialog>
        <Dialog
          isOpen={fullDialogOpen}
          onClose={() => setFullDialogOpen(false)}
          title="Meter — low step polish"
          size="full"
        >
          <p className="text-[var(--semantic-ink-body)]">Full-page run detail content goes here.</p>
        </Dialog>
      </Section>

      <Section title="Toast">
        <Row label="Variants">
          <Button
            appearance="secondary"
            onClick={() => {
              setToastVariant('default');
              setToastVisible(true);
              setTimeout(() => setToastVisible(false), 2500);
            }}
          >
            Show confirmation
          </Button>
          <Button
            appearance="secondary"
            onClick={() => {
              setToastVariant('error');
              setToastVisible(true);
              setTimeout(() => setToastVisible(false), 2500);
            }}
          >
            Show error
          </Button>
        </Row>
        <Toast isVisible={toastVisible} variant={toastVariant}>
          {toastVariant === 'error' ? 'Failed to save settings' : 'Settings saved'}
        </Toast>
      </Section>

      <Section title="SidebarNav">
        <div className="h-[360px] border border-[var(--semantic-border)] rounded-[var(--semantic-radius-lg)] overflow-hidden bg-[var(--semantic-surface)]">
          <SidebarNav
            items={[
              { key: 'tasks', label: 'Tasks', href: '#', isActive: true },
              { key: 'skills', label: 'Skills' },
              { key: 'agents', label: 'Agents' },
              { key: 'context', label: 'Context' },
              { key: 'connectors', label: 'Connectors' },
            ]}
            footerNote="Generated 2026-08-21 · not live"
          />
        </div>
      </Section>

      <Section title="Column">
        <div className="flex bg-[var(--semantic-surface)] border border-[var(--semantic-border)] rounded-[var(--semantic-radius-lg)] p-2 overflow-x-auto">
          <Column title="Plan" count={2}>
            <Card title="Vault — first-run empty state" meta="Plan · 1 of 4" onClick={() => {}} />
            <Card
              title="Vault — library tiles"
              meta="Plan · 2 of 4"
              tags={<Badge variant="running">Running</Badge>}
              onClick={() => {}}
            />
          </Column>
          <Column title="Review" count={0} />
        </div>
      </Section>
    </div>
  );
}

export default App;
