import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const dataDir = path.join(process.cwd(), 'data');

function readCSV<T>(filename: string): T[] {
  try {
    const filePath = path.join(dataDir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = Papa.parse<T>(content, { header: true, skipEmptyLines: true });
    return result.data;
  } catch {
    return [];
  }
}

export interface Job {
  Job_Number: string;
  Job_Name: string;
  Status: string;
  Start_Date: string;
  Location: string;
  Project_Manager: string;
  Target_Tonnage: string;
}

export interface Rental {
  Job_Number: string;
  Equipment_Type: string;
  Vendor: string;
  Days_On_Site: string;
  Target_Off_Rent: string;
  Daily_Rate: string;
}

export interface PrepItem {
  Job_Number: string;
  Nearest_Asphalt_Plant: string;
  Asphalt_Credit_Status: string;
  Nearest_Quarry: string;
  Base_Credit_Status: string;
}

export interface FieldReport {
  Job_Number: string;
  Asphalt_Actual: string;
  Asphalt_Target: string;
  Base_Actual: string;
  Base_Target: string;
  Concrete_Actual: string;
  Concrete_Target: string;
}

export function getAllJobs(): Job[] {
  return readCSV<Job>('Level10_ReadOnly.csv');
}

export function getJobByNumber(jobNumber: string): Job | undefined {
  return getAllJobs().find(j => j.Job_Number.trim() === jobNumber.trim());
}

export function getAllRentals(): Rental[] {
  return readCSV<Rental>('Equipment_On_Rent.csv');
}

export function getRentalsForJob(jobNumber: string): Rental[] {
  return getAllRentals().filter(r => r.Job_Number.trim() === jobNumber.trim());
}

export function getPrepForJob(jobNumber: string): PrepItem | undefined {
  const all = readCSV<PrepItem>('Job_Prep_Board.csv');
  return all.find(p => p.Job_Number.trim() === jobNumber.trim());
}

export function getFieldReportForJob(jobNumber: string): FieldReport | undefined {
  const all = readCSV<FieldReport>('Field_Reports.csv');
  return all.find(r => r.Job_Number.trim() === jobNumber.trim());
}
