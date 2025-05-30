import { Database } from 'sqlite3';

// Sample code with intentional issues for multi-critic review
export class UserService {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  // Issue 1: SQL injection vulnerability
  async getUser(userId: string) {
    const query = `SELECT * FROM users WHERE id = '${userId}'`;
    return new Promise((resolve) => {
      this.db.get(query, (err, row) => {
        resolve(row); // Issue 2: No error handling
      });
    });
  }

  // Issue 3: Inefficient algorithm (O(n²) complexity)
  findDuplicateEmails(users: Array<{email: string}>) {
    const duplicates = [];
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        if (users[i].email === users[j].email) {
          duplicates.push(users[i].email);
        }
      }
    }
    return duplicates;
  }

  // Issue 4: No input validation
  updateUserAge(userId: string, age: unknown) {
    const query = `UPDATE users SET age = ${age} WHERE id = '${userId}'`;
    this.db.run(query); // Issue 5: No callback or promise
  }

  // Issue 6: Resource leak - no db.close()
}