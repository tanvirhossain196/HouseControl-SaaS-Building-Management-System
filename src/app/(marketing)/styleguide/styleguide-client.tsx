'use client'

import * as React from 'react'
import { Building2, LogOut, Settings, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Tabs } from '@/components/ui/tabs'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar } from '@/components/ui/avatar'
import { Tooltip } from '@/components/ui/tooltip'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import { useToast } from '@/components/providers/toast-provider'
import { dueLabel, formatTaka } from '@/lib/utils'

const swatches = [
  { name: 'paper', className: 'bg-paper' },
  { name: 'surface', className: 'bg-surface' },
  { name: 'raised', className: 'bg-raised' },
  { name: 'primary', className: 'bg-primary' },
  { name: 'accent', className: 'bg-accent' },
  { name: 'paid', className: 'bg-paid' },
  { name: 'due', className: 'bg-due' },
  { name: 'overdue', className: 'bg-overdue' },
  { name: 'vacant', className: 'bg-vacant' },
]

const residents = [
  { flat: '5B', name: 'Shirin Akter', share: 12000, days: 3, tone: 'due' as const },
  { flat: '4A', name: 'Kamrul Hasan', share: 9000, days: -4, tone: 'overdue' as const },
  { flat: '3A', name: 'Sabbir Rahman', share: 11000, days: 6, tone: 'paid' as const },
]

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-10 first:border-t-0 first:pt-0">
      <h2 className="text-title text-ink">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  )
}

export function StyleguideClient() {
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)

  return (
    <div>
      <Block title="Colour">
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {swatches.map((s) => (
            <li key={s.name}>
              <div className={`h-14 rounded-panel border border-line ${s.className}`} />
              <p className="tabular mt-2 font-mono text-xs text-muted">{s.name}</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Type scale">
        <div className="space-y-4">
          <p className="text-display-lg text-ink">Display large</p>
          <p className="text-display text-ink">Display</p>
          <p className="text-title text-ink">Section title</p>
          <p className="text-lead text-muted">Lead paragraph, used under headings.</p>
          <p className="text-sm text-muted">Body small — the default in dense screens.</p>
          <p className="tabular font-mono text-sm text-ink">
            {formatTaka(24500)} · flat 5B · {dueLabel(3)}
          </p>
        </div>
      </Block>

      <Block title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Confirm payment</Button>
          <Button variant="accent">Send reminder</Button>
          <Button variant="outline">Edit flat</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="quiet">Skip</Button>
          <Button variant="danger">
            <Trash2 /> Remove resident
          </Button>
          <Button variant="link">View receipt</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Building settings">
            <Building2 />
          </Button>
        </div>
      </Block>

      <Block title="Badges and status">
        <div className="flex flex-wrap gap-2">
          <Badge tone="paid" dot>
            Rent paid
          </Badge>
          <Badge tone="due" dot>
            Due in 3 days
          </Badge>
          <Badge tone="overdue" dot>
            4 days overdue
          </Badge>
          <Badge tone="primary">Moderator</Badge>
          <Badge tone="accent">Pro</Badge>
          <Badge tone="outline">Vacant</Badge>
        </div>
      </Block>

      <Block title="Cards">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card interactive>
            <CardHeader>
              <CardTitle>Nasreen Tower</CardTitle>
              <CardDescription>Mirpur DOHS · 12 units · 2 overdue</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="tabular font-mono text-2xl font-semibold text-ink">
                {formatTaka(263000)}
              </p>
              <p className="mt-1 text-sm text-muted">collected this month</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3">
              <Avatar name="Shirin Akter" size="lg" />
              <div>
                <p className="font-medium text-ink">Shirin Akter</p>
                <p className="text-sm text-muted">Flat 5B · 5 residents</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </Block>

      <Block title="Forms">
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <Field label="Resident name" htmlFor="sg-name" required>
            <Input id="sg-name" placeholder="Full name" />
          </Field>
          <Field
            label="Rent share"
            htmlFor="sg-rent"
            hint="Shares must add up to the flat total."
          >
            <Input id="sg-rent" inputMode="numeric" placeholder="12000" />
          </Field>
          <Field label="Flat" htmlFor="sg-flat">
            <Select id="sg-flat" defaultValue="5B">
              <option>5A</option>
              <option>5B</option>
              <option>6A</option>
            </Select>
          </Field>
          <Field
            label="Mobile"
            htmlFor="sg-phone"
            error="Use a Bangladeshi mobile number."
          >
            <Input id="sg-phone" aria-invalid defaultValue="0177" />
          </Field>
          <Field label="Note" htmlFor="sg-note" className="sm:col-span-2">
            <Textarea id="sg-note" placeholder="Anything the owner should know" />
          </Field>
        </div>
      </Block>

      <Block title="Overlays">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setOpen(true)}>
            Open dialog
          </Button>
          <Tooltip label="Sends an SMS and an email to the resident">
            <Button variant="outline">Hover for tooltip</Button>
          </Tooltip>
          <Dropdown trigger={<Button variant="outline">Flat actions</Button>}>
            <DropdownItem>
              <Settings className="size-4" /> Flat settings
            </DropdownItem>
            <DropdownItem>Transfer moderator role</DropdownItem>
            <DropdownSeparator />
            <DropdownItem className="text-overdue">
              <LogOut className="size-4" /> Remove resident
            </DropdownItem>
          </Dropdown>
          <Button
            variant="outline"
            onClick={() =>
              toast({
                tone: 'success',
                title: 'Payment confirmed',
                body: 'Receipt sent to 5B.',
              })
            }
          >
            Success toast
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast({
                tone: 'error',
                title: 'Payment failed',
                body: 'The gateway rejected it.',
              })
            }
          >
            Error toast
          </Button>
          <Button
            variant="outline"
            onClick={() => toast({ tone: 'warning', title: 'Rent day is tomorrow' })}
          >
            Warning toast
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast({ tone: 'info', title: 'Gas bill split across 10 flats' })
            }
          >
            Info toast
          </Button>
        </div>

        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Remove Kamrul Hasan from flat 4A?"
          description="Their dues stay on the flat ledger and the removal is written to the audit log."
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Keep resident
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setOpen(false)
                  toast({
                    tone: 'success',
                    title: 'Resident removed',
                    body: 'Flat 4A updated.',
                  })
                }}
              >
                Remove resident
              </Button>
            </>
          }
        >
          <p>
            The flat keeps its rent total, so the remaining residents&rsquo; shares will
            need to be reassigned.
          </p>
        </Modal>
      </Block>

      <Block title="Tabs and tables">
        <Tabs
          items={[
            {
              id: 'residents',
              label: 'Residents',
              content: (
                <Table>
                  <THead>
                    <TR>
                      <TH>Flat</TH>
                      <TH>Resident</TH>
                      <TH>Share</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {residents.map((r) => (
                      <TR key={r.flat}>
                        <TD className="tabular font-mono text-xs">{r.flat}</TD>
                        <TD>{r.name}</TD>
                        <TD className="tabular font-mono">{formatTaka(r.share)}</TD>
                        <TD>
                          <Badge tone={r.tone} dot>
                            {r.tone === 'paid' ? 'Paid' : dueLabel(r.days)}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ),
            },
            {
              id: 'payments',
              label: 'Payments',
              content: (
                <p className="text-sm text-muted">Payment history lands in Phase 7.</p>
              ),
            },
            {
              id: 'empty',
              label: 'Complaints',
              content: (
                <div className="rounded-panel border border-dashed border-line p-10 text-center">
                  <p className="font-medium text-ink">No open complaints</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                    When a resident reports a problem it appears here with a photo and a
                    status.
                  </p>
                  <Button variant="outline" size="sm" className="mt-4">
                    Log one on their behalf
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Block>
    </div>
  )
}
