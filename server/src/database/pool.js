import mysql from 'mysql2/promise';
import { databaseConfig } from '../config/database.js';

export const pool = mysql.createPool(databaseConfig);
