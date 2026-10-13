import * as SQLite from 'expo-sqlite';
import { GymRepository, type SqlClient, type SqlDatabase, type SqlParam } from './gym-repository';

// Keep Expo's native binding behind this adapter so domain persistence can be
// integration-tested against a real SQLite database without loading React Native.
type NativeClient = SQLite.SQLiteDatabase | SQLite.SQLiteDatabase;
function adaptClient(native: NativeClient): SqlClient {
  return {
    execAsync: (sql) => native.execAsync(sql),
    runAsync: (sql, ...params: SqlParam[]) => native.runAsync(sql, ...params),
    getFirstAsync: async (sql, ...params: SqlParam[]) =>
      (await native.getFirstAsync(sql, ...params)) ?? null,
    getAllAsync: (sql, ...params: SqlParam[]) => native.getAllAsync(sql, ...params),
  };
}

export async function openGymRepository(): Promise<GymRepository> {
  const native = await SQLite.openDatabaseAsync('gym-app.db');
  const client = adaptClient(native);
  const database: SqlDatabase = {
    ...client,
    withExclusiveTransactionAsync: (operation) =>
      native.withExclusiveTransactionAsync((tx) => operation(adaptClient(tx))),
  };
  return new GymRepository(database);
}
