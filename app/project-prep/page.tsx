import { fetchProjectPrepCenter, type ProjectPrepJob, type ProjectPrepResource } from '@/lib/project-prep-data';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{ job?: string }>;
};

export default async function ProjectPrepPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const payload = await fetchProjectPrepCenter();
  const selectedJob = payload.jobs.find(job => job.jobNumber === params.job) || payload.jobs[0];

  if (!selectedJob) {
    return (
      <div className="min-h-screen bg-[#F7F8F8] px-6 py-8 font-body text-[#343C3E]">
        <h1 className="font-display text-3xl font-black uppercase">Project Prep Center</h1>
        <p className="mt-3 text-sm text-[#757A7F]">No active jobs were returned from Sunbelt Project Setup - Active_Jobs.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8F8] font-body text-[#343C3E]">
      <header className="border-b border-[#D8DEE3] bg-white px-5 py-5 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-display text-xs font-black uppercase tracking-[0.18em] text-[#20BC64]">Sunbelt Sports Operations</p>
            <h1 className="mt-1 font-display text-4xl font-black uppercase leading-none tracking-tight text-[#202325]">Project Prep Center</h1>
            <p className="mt-2 max-w-3xl text-sm text-[#5F676B]">
              Execution-readiness cockpit backed by Sunbelt Project Setup, Project Prep Automation Center, Level 10, and Scorecard source data.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Active jobs" value={payload.summary.activeJobs} />
            <Metric label="Ready" value={payload.summary.readyJobs} tone="ready" />
            <Metric label="Review" value={payload.summary.reviewJobs} tone="watch" />
            <Metric label="Blockers" value={payload.summary.openBlockers} tone="blocked" />
          </div>
        </div>
      </header>

      <div className="grid gap-5 px-5 py-5 lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:px-8">
        <aside className="space-y-4">
          <section className="border border-[#D8DEE3] bg-white">
            <div className="border-b border-[#D8DEE3] px-4 py-3">
              <p className="font-display text-xs font-black uppercase tracking-[0.16em] text-[#757A7F]">Active Job Context</p>
              <h2 className="font-display text-xl font-black uppercase text-[#202325]">Job Selector</h2>
            </div>
            <nav className="max-h-[580px] overflow-auto">
              {payload.jobs.map(job => (
                <a
                  key={job.jobNumber}
                  href={`/project-prep?job=${encodeURIComponent(job.jobNumber)}`}
                  className={`block border-l-4 px-4 py-3 transition ${
                    job.jobNumber === selectedJob.jobNumber
                      ? 'border-[#20BC64] bg-[#E8F8EF]'
                      : 'border-transparent hover:bg-[#F1F3F4]'
                  }`}
                >
                  <div className="font-mono text-xs font-bold text-[#202325]">{job.jobNumber}</div>
                  <div className="mt-0.5 text-sm font-semibold leading-tight">{job.jobName}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-[#757A7F]">{job.city}, {job.state}</div>
                </a>
              ))}
            </nav>
          </section>

          <section className="border border-[#D8DEE3] bg-white p-4">
            <p className="font-display text-xs font-black uppercase tracking-[0.16em] text-[#757A7F]">Readiness Funnel</p>
            <div className="mt-3 space-y-3">
              {selectedJob.readiness.funnel.map(step => (
                <div key={step.label} className="flex gap-3">
                  <span className={`mt-1 h-3 w-3 shrink-0 border ${step.complete ? 'border-[#20BC64] bg-[#20BC64]' : 'border-[#E9A63B] bg-white'}`} />
                  <div>
                    <div className="font-display text-sm font-black uppercase">{step.label}</div>
                    <div className="text-xs text-[#5F676B]">{step.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <main className="space-y-5">
          <section className="border border-[#D8DEE3] bg-white">
            <div className="flex flex-col gap-4 border-b border-[#D8DEE3] px-5 py-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-display text-xs font-black uppercase tracking-[0.18em] text-[#757A7F]">
                  {selectedJob.jobNumber} | Commit Readiness | {selectedJob.wipStatus || 'Status blank'}
                </p>
                <h2 className="font-display text-3xl font-black uppercase leading-none text-[#202325]">{selectedJob.jobName}</h2>
                <p className="mt-2 text-sm text-[#5F676B]">{selectedJob.address}</p>
              </div>
              <div className="text-left md:text-right">
                <StatusPill status={selectedJob.readiness.status} />
                <div className="mt-2 font-mono text-5xl font-black leading-none text-[#202325]">
                  {selectedJob.readiness.readyPercent}<span className="text-2xl text-[#757A7F]">%</span>
                </div>
                <div className="font-display text-xs font-black uppercase tracking-[0.16em] text-[#757A7F]">
                  {selectedJob.readiness.readyCount}/{selectedJob.readiness.requiredCount} Required Ready
                </div>
              </div>
            </div>
            <div className="grid border-b border-[#D8DEE3] md:grid-cols-4">
              <InfoCell label="Contractor" value={selectedJob.generalContractor || 'Blank'} />
              <InfoCell label="Contact" value={selectedJob.pointOfContact || 'Blank'} />
              <InfoCell label="Plan Date" value={selectedJob.planDate || selectedJob.schedule.scheduledStart || 'Blank'} />
              <InfoCell label="Est. Tons" value={selectedJob.estimatedTons ? selectedJob.estimatedTons.toLocaleString() : 'Blank'} />
            </div>
            <div className="grid gap-0 md:grid-cols-3">
              <ReadinessCard label="Job Instantiated" complete={true} detail="Active_Jobs row present" />
              <ReadinessCard
                label="Credit Cleared"
                complete={!selectedJob.resources.some(resource => resource.required && resource.label.match(/Asphalt|Rock|Concrete/) && resource.riskLevel !== 'ready')}
                detail={`${selectedJob.resources.filter(resource => resource.required && resource.label.match(/Asphalt|Rock|Concrete/) && resource.riskLevel !== 'ready').length} account items open`}
              />
              <ReadinessCard
                label="Blockers Resolved"
                complete={selectedJob.blockers.length === 0}
                detail={`${selectedJob.blockers.length} blockers/watch items`}
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="font-display text-xs font-black uppercase tracking-[0.16em] text-[#757A7F]">Resource Configuration</p>
                <h2 className="font-display text-2xl font-black uppercase text-[#202325]">Vendor, Material, Trucking, Disposal, Equipment</h2>
              </div>
              <div className="text-xs text-[#757A7F]">Source: Sunbelt Project Setup - Job_Prep_Board</div>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {selectedJob.resources.map(resource => (
                <ResourceCard key={resource.key} resource={resource} />
              ))}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Go-Live Blockers" eyebrow="Action Queue">
              {selectedJob.blockers.length ? (
                <div className="space-y-3">
                  {selectedJob.blockers.map(blocker => (
                    <div key={`${blocker.label}-${blocker.reason}`} className="border border-[#D8DEE3] bg-[#F7F8F8] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-display text-sm font-black uppercase">{blocker.label}</div>
                        <span className={`px-2 py-1 font-display text-[10px] font-black uppercase ${blocker.severity === 'blocked' ? 'bg-[#FDECEC] text-[#B42318]' : 'bg-[#FFF5DF] text-[#8A5A00]'}`}>
                          {blocker.severity}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-[#5F676B]">{blocker.reason}</p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#202325]">{blocker.nextAction}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyLine text="No open blockers for this job." />
              )}
            </Panel>

            <Panel title="Scope Trace" eyebrow="Work Order Extraction">
              <TraceLine label="Asphalt" value={selectedJob.scope.asphalt || selectedJob.asphaltSource || 'Blank'} />
              <TraceLine label="Base / GAB" value={selectedJob.scope.base || 'Blank'} />
              <TraceLine label="Drainage" value={selectedJob.scope.drainage || 'Blank'} />
              <TraceLine label="Field Events" value={selectedJob.scope.fieldEvents || 'Blank'} />
              <div className="mt-3 text-xs text-[#757A7F]">{selectedJob.scope.source}</div>
            </Panel>
          </section>
        </main>

        <aside className="space-y-4">
          <Panel title="Weather Forecast" eyebrow="Execution Risk">
            <div className="flex items-end justify-between">
              <div>
                <div className="font-display text-4xl font-black uppercase text-[#202325]">
                  {selectedJob.weather.rainPercent === null ? 'N/A' : `${selectedJob.weather.rainPercent}%`}
                </div>
                <div className="text-sm text-[#5F676B]">{selectedJob.weather.conditions}</div>
              </div>
              <StatusPill status={selectedJob.weather.risk === 'HIGH' ? 'BLOCKED' : selectedJob.weather.risk === 'WATCH' ? 'REVIEW' : 'READY'} />
            </div>
            <div className="mt-3 text-xs text-[#757A7F]">{selectedJob.weather.source}</div>
          </Panel>

          <Panel title="Nearby Jobs" eyebrow="Scheduling Support">
            {selectedJob.nearbyJobs.length ? (
              <div className="space-y-2">
                {selectedJob.nearbyJobs.map(nearby => (
                  <div key={nearby.jobNumber} className="flex items-center justify-between gap-3 border-b border-[#EEF1F3] pb-2 last:border-0 last:pb-0">
                    <div>
                      <div className="font-mono text-xs font-bold">{nearby.jobNumber}</div>
                      <div className="text-sm font-semibold">{nearby.jobName}</div>
                      <div className="text-xs text-[#757A7F]">{nearby.city}, {nearby.state}</div>
                    </div>
                    <div className="font-mono text-sm font-bold">{nearby.miles} mi</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyLine text="Coordinates unavailable for nearby job matching." />
            )}
          </Panel>

          <Panel title="Equipment Visibility" eyebrow="Rentals / VisionLink">
            <TraceLine label="Active rentals" value={String(selectedJob.equipment.rentals.length)} />
            <TraceLine label="Visible assets" value={String(selectedJob.equipment.assets.length)} />
            <div className="mt-3 space-y-2">
              {selectedJob.equipment.rentals.slice(0, 3).map(rental => (
                <div key={`${rental.contractNumber}-${rental.equipmentType}`} className="border border-[#D8DEE3] p-2">
                  <div className="text-sm font-semibold">{rental.equipmentType}</div>
                  <div className="text-xs text-[#757A7F]">{rental.vendor} | {rental.daysOnRent} days on rent</div>
                </div>
              ))}
              {!selectedJob.equipment.rentals.length && <EmptyLine text="No rental rows matched to this job." />}
            </div>
          </Panel>

          <Panel title="Action Buttons" eyebrow="Setup Outreach">
            <div className="space-y-2">
              {selectedJob.actions.map(action => (
                <a
                  key={`${action.label}-${action.href}`}
                  href={action.href}
                  className="block border border-[#202325] bg-[#202325] px-3 py-2 text-center font-display text-xs font-black uppercase tracking-wide text-white transition hover:border-[#20BC64] hover:bg-[#20BC64]"
                >
                  {action.label}
                </a>
              ))}
            </div>
          </Panel>

          <Panel title="Source Data Links" eyebrow="Traceability">
            <div className="space-y-2">
              {[
                ['Project Setup', selectedJob.links.projectSetup],
                ['Prep Automation', selectedJob.links.prepAutomation],
                ['Level 10', selectedJob.links.level10],
                ['Scorecard', selectedJob.links.scorecard],
                ['Work Order', selectedJob.links.workOrder],
                ['Project Folder', selectedJob.links.jobFolder],
                ['Cost Sheet', selectedJob.links.costSheet],
              ].map(([label, href]) => href ? (
                <a key={label} href={href} className="block text-sm font-semibold text-[#202325] underline decoration-[#20BC64] underline-offset-4">
                  {label}
                </a>
              ) : null)}
            </div>
          </Panel>
        </aside>
      </div>

      <section className="border-t border-[#D8DEE3] bg-white px-5 py-5 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Source Of Truth Map" eyebrow="Consolidation Contract">
            <div className="space-y-3">
              {payload.sourceOfTruth.map(item => (
                <div key={item.dataType} className="border-b border-[#EEF1F3] pb-3 last:border-0 last:pb-0">
                  <div className="font-display text-sm font-black uppercase">{item.dataType}</div>
                  <div className="mt-1 text-sm font-semibold text-[#20BC64]">{item.source}</div>
                  <div className="mt-1 text-xs text-[#5F676B]">{item.reason}</div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Contract Warnings" eyebrow="Data Quality">
            {payload.issues.length ? (
              <ul className="space-y-2">
                {payload.issues.map(issue => (
                  <li key={issue} className="border border-[#FFF0C2] bg-[#FFF9E8] px-3 py-2 text-sm text-[#6F4B00]">{issue}</li>
                ))}
              </ul>
            ) : (
              <EmptyLine text="No contract warnings detected." />
            )}
          </Panel>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'ready' | 'watch' | 'blocked' }) {
  const toneClass = tone === 'ready' ? 'text-[#05632F]' : tone === 'watch' ? 'text-[#8A5A00]' : tone === 'blocked' ? 'text-[#B42318]' : 'text-[#202325]';
  return (
    <div className="min-w-28 border border-[#D8DEE3] bg-white px-4 py-3">
      <div className={`font-mono text-2xl font-black ${toneClass}`}>{value}</div>
      <div className="font-display text-[10px] font-black uppercase tracking-[0.14em] text-[#757A7F]">{label}</div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-[#D8DEE3] px-5 py-4 last:border-r-0">
      <div className="font-display text-[10px] font-black uppercase tracking-[0.16em] text-[#757A7F]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[#202325]">{value}</div>
    </div>
  );
}

function ReadinessCard({ label, complete, detail }: { label: string; complete: boolean; detail: string }) {
  return (
    <div className="border-r border-[#D8DEE3] px-5 py-4 last:border-r-0">
      <div className={`font-display text-sm font-black uppercase ${complete ? 'text-[#05632F]' : 'text-[#8A5A00]'}`}>{label}</div>
      <div className="mt-1 text-xs text-[#5F676B]">{detail}</div>
    </div>
  );
}

function ResourceCard({ resource }: { resource: ProjectPrepResource }) {
  const color = resource.riskLevel === 'ready'
    ? 'border-l-[#20BC64]'
    : resource.riskLevel === 'blocked'
      ? 'border-l-[#E04343]'
      : resource.riskLevel === 'watch'
        ? 'border-l-[#E9A63B]'
        : 'border-l-[#9CA3AF]';
  return (
    <article className={`border border-l-4 border-[#D8DEE3] bg-white ${color}`}>
      <div className="flex items-start justify-between gap-3 border-b border-[#D8DEE3] px-4 py-3">
        <div>
          <div className="font-display text-lg font-black uppercase text-[#202325]">{resource.label}</div>
          <div className="text-xs text-[#757A7F]">{resource.required ? 'Required for current scope' : 'Not required by need flags'}</div>
        </div>
        <span className={`px-2 py-1 font-display text-[10px] font-black uppercase ${statusBadgeClass(resource.status)}`}>{resource.status}</span>
      </div>
      <div className="grid gap-0 md:grid-cols-2">
        <div className="border-b border-[#EEF1F3] px-4 py-3 md:border-r">
          <div className="font-display text-[10px] font-black uppercase tracking-[0.16em] text-[#757A7F]">Primary</div>
          <div className="mt-1 text-sm font-semibold">{resource.primary || 'Unassigned'}</div>
          <div className="mt-2 text-xs text-[#757A7F]">Account: {resource.accountStatus || 'Blank'} | Pending app: {resource.pendingApp || 'Blank'}</div>
        </div>
        <div className="border-b border-[#EEF1F3] px-4 py-3">
          <div className="font-display text-[10px] font-black uppercase tracking-[0.16em] text-[#757A7F]">Alternates</div>
          <div className="mt-1 space-y-1 text-sm">
            {resource.alternates.length ? resource.alternates.map(alternate => <div key={alternate}>{alternate}</div>) : <div className="text-[#757A7F]">Blank</div>}
          </div>
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="text-sm font-semibold">{resource.nextAction}</div>
        <div className="mt-1 text-xs text-[#757A7F]">{resource.riskNote || resource.source}</div>
      </div>
    </article>
  );
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="border border-[#D8DEE3] bg-white p-4">
      <div className="mb-3">
        <p className="font-display text-[10px] font-black uppercase tracking-[0.16em] text-[#757A7F]">{eyebrow}</p>
        <h2 className="font-display text-xl font-black uppercase text-[#202325]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function TraceLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#EEF1F3] py-2 last:border-0">
      <div className="font-display text-[10px] font-black uppercase tracking-[0.14em] text-[#757A7F]">{label}</div>
      <div className="mt-1 text-sm text-[#202325]">{value}</div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="border border-[#D8DEE3] bg-[#F7F8F8] px-3 py-3 text-sm text-[#757A7F]">{text}</div>;
}

function StatusPill({ status }: { status: ProjectPrepJob['readiness']['status'] | 'READY' | 'REVIEW' | 'BLOCKED' }) {
  return <span className={`inline-flex px-2 py-1 font-display text-[10px] font-black uppercase tracking-[0.14em] ${statusBadgeClass(status)}`}>{status}</span>;
}

function statusBadgeClass(status: string) {
  if (status === 'READY') return 'bg-[#E8F8EF] text-[#05632F]';
  if (status === 'BLOCKED' || status === 'NO ACCOUNT' || status === 'MISSING') return 'bg-[#FDECEC] text-[#B42318]';
  if (status === 'NOT REQUIRED') return 'bg-[#F1F3F4] text-[#5F676B]';
  return 'bg-[#FFF5DF] text-[#8A5A00]';
}
