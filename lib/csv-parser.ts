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

export interface ChangeOrder {
  Job_Number: string;
  CO_Number: string;
  Description: string;
  Requested_By: string;
  Date_Submitted: string;
  Status: string;
  Amount: string;
  Type: string;
  Notes: string;
}

export function getAllChangeOrders(): ChangeOrder[] {
  return readCSV<ChangeOrder>('Change_Orders.csv');
}

export function getChangeOrdersForJob(jobNumber: string): ChangeOrder[] {
  return getAllChangeOrders().filter(co => co.Job_Number.trim() === jobNumber.trim());
}

export interface ProjectScorecard {
  Job_Number: string;
  Est_Man_Hours: string;
  Act_Man_Hours: string;
  Est_Stone_Tons: string;
  Act_Stone_Tons: string;
  Est_Binder_Tons: string;
  Act_Binder_Tons: string;
  Est_Topping_Tons: string;
  Act_Topping_Tons: string;
  Est_Days_On_Site: string;
  Act_Days_On_Site: string;
  Weather_Days: string;
}

export function getAllScorecards(): ProjectScorecard[] {
  return readCSV<ProjectScorecard>('Project_Scorecards.csv');
}

export function getScorecardForJob(jobNumber: string): ProjectScorecard | undefined {
  return getAllScorecards().find(s => s.Job_Number.trim() === jobNumber.trim());
}

export interface JobFolder {
  Job_Number: string;
  Job_Folder_Link: string;
  Contract_Link: string;
  Work_Order_Link: string;
  Plans_Link: string;
  Material_Resources_Link: string;
}

export function getJobFolder(jobNumber: string): JobFolder | undefined {
  const all = readCSV<JobFolder>('Job_Folders.csv');
  return all.find(f => f.Job_Number.trim() === jobNumber.trim());
}
