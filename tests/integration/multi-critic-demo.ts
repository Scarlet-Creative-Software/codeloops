/**
 * Test file to demonstrate multi-critic consensus system
 * This file intentionally contains various issues for critics to identify
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class UserAuthentication {
  private users = new Map();
  
  // Intentional security issue: storing passwords in plain text
  async registerUser(email: string, password: string) {
    // No input validation
    this.users.set(email, {
      email,
      password, // Plain text password storage
      createdAt: new Date()
    });
    
    return { success: true };
  }
  
  // Inefficient search algorithm
  findUsersByDomain(domain: string) {
    const results = [];
    // O(n) iteration through all users
    for (const [email, user] of this.users) {
      if (email.endsWith(domain)) {
        results.push(user);
      }
    }
    return results;
  }
  
  // Missing error handling
  async authenticate(email: string, password: string) {
    const user = this.users.get(email);
    return user.password === password;
  }
  
  // SQL injection vulnerability
  async getUsersByQuery(query: string) {
    // Simulated SQL query - vulnerable to injection
    const sql = `SELECT * FROM users WHERE email LIKE '%${query}%'`;
    console.log("Executing SQL:", sql);
    // ... database execution
  }
  
  // Performance issue: no caching
  async calculateUserStats() {
    let totalLogins = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [email, user] of this.users) {
      // Expensive operation repeated for each user
      const loginCount = await this.fetchLoginHistory(email);
      totalLogins += loginCount;
    }
    return totalLogins;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async fetchLoginHistory(_email: string): Promise<number> {
    // Simulate expensive API call
    await new Promise(resolve => setTimeout(resolve, 100));
    return Math.floor(Math.random() * 100);
  }
}