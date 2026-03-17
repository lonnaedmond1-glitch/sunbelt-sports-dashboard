import { fetchScheduleData, fetchLiveJobs } from './lib/sheets-data.ts';

async function run() {
  const [schedule, jobs] = await Promise.all([
    fetchScheduleData(),
    fetchLiveJobs(),
  ]);

  console.log('--- JOBS CONTAINING CHATEAU ---');
  const chateauJobs = jobs.filter((j: any) => j.Job_Name?.toLowerCase().includes('chateau'));
  console.log(chateauJobs.map((j: any) => `${j.Job_Number} - ${j.Job_Name}`));

  console.log('\n--- SCHEDULE GANTT MATCHES ---');
  const chateauGantt = schedule.activeGanttJobs?.filter((g: any) => g.Job_Name?.toLowerCase().includes('chateau'));
  console.log(chateauGantt);

  console.log('\n--- CURRENT WEEK ASSIGNMENTS ---');
  const targetCrews = ['Rosendo / P1', 'Cesar'];
  
  schedule.currentWeek?.days?.forEach((day: any) => {
    day.assignments?.forEach((a: any) => {
      if (targetCrews.includes(a.crew)) {
        if (a.decoded?.jobRef?.toLowerCase().includes('chateau')) {
          console.log(`Day: ${day.dayOfWeek}, Crew: ${a.crew}, Raw Text: "${a.rawText}", Ref: "${a.decoded.jobRef}", Gantt Match: ${a.ganttMatch?.jobNumber}`);
        }
      }
    });
  });

  console.log('\n--- NEXT WEEK ASSIGNMENTS ---');
  schedule.nextWeek?.days?.forEach((day: any) => {
    day.assignments?.forEach((a: any) => {
      if (targetCrews.includes(a.crew)) {
        if (a.decoded?.jobRef?.toLowerCase().includes('chateau')) {
          console.log(`Day: ${day.dayOfWeek}, Crew: ${a.crew}, Raw Text: "${a.rawText}", Ref: "${a.decoded.jobRef}", Gantt Match: ${a.ganttMatch?.jobNumber}`);
        }
      }
    });
  });
}

run();
