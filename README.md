# Account & Transaction API

A REST API built with **Node.js, Express, MySQL, and handwritten SQL (`mysql2`)** to manage accounts, balances, transactions, and money transfers.

## Features

- Create and retrieve accounts.
- Credit and debit account balances.
- Prevent debits that exceed the available balance.
- Maintain transaction history with pagination and optional type filtering.
- Prevent duplicate transactions using client-generated reference IDs.
- Support atomic transfers between accounts.
- Use database transactions and pessimistic locking to protect concurrent balance updates.
- Provide consistent account-lock ordering to reduce deadlocks during transfers.
- Initialize the database schema automatically at startup.

## Project Documentation

- [Design Document](./design.txt) — architecture, database schema, transaction flow, concurrency handling, and design decisions.
- [Postman API Collection](./conf.postman_collection.json) — API endpoints, request bodies, and examples.
- [Environment Configuration Example](./example.env) — environment variables required to connect to MySQL.

## Prerequisites

Ensure the following are installed on your local machine:

- [Node.js](https://nodejs.org/) and npm
- [MySQL Server](https://dev.mysql.com/downloads/mysql/)
- [Postman](https://www.postman.com/downloads/) to test the API

**Important:** MySQL Server must be installed, running, and accessible locally before starting the application.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/ianuj4231/conf_pay.git
cd conf_pay
```

### 2. Configure environment variables

Create a `.env` file in the project root using `example.env` as a reference.

Copy the example file:

**Windows Command Prompt:**

```cmd
copy example.env .env
```

**PowerShell:**

```powershell
Copy-Item example.env .env
```

Update `.env` with your local MySQL credentials:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=account_transactions
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
```

Replace the username and password with your actual MySQL credentials. Keep `.env` local and do not commit credentials to Git.

### 3. Start MySQL

Make sure your local MySQL Server is running and listening on the configured host and port, typically `127.0.0.1:3306`.

The MySQL user configured in `.env` must have the required permissions to create the database if it does not exist and create the application's tables.

### 4. Install dependencies

From the project root, run:

```bash
npm install
```

### 5. Start the application

```bash
npm start
```

The application should connect to MySQL, create the configured database if necessary, and initialize the required tables using the schema setup.

Check the terminal output for the server's startup message and any database connection errors. Use the port configured by the application.

## Testing with Postman

1. Open Postman.
2. Select **Import**.
3. Choose the repository's `conf.postman_collection.json` file.
4. Open the imported collection.
5. Ensure the application is running and send the requests in order in Postman.

The collection contains the available API endpoints and their request bodies. Refer to the collection for the exact routes, parameters, and example payloads.

For transaction requests, use a unique client-generated `reference_id` for each new operation. Reuse the same reference ID when retrying the same operation to avoid duplicate balance changes.

## Money Transfer

The optional `POST /transfers` endpoint transfers money between two accounts.

The operation locks both account rows in ascending account-ID order, checks the sender's balance, updates both balances, and records the transfer and associated transactions in a single database transaction.

If any step fails, the operation is rolled back to prevent partial transfers.

## Error Handling

The API uses appropriate HTTP status codes, including:

- `400 Bad Request` — invalid request parameters or body.
- `404 Not Found` — requested account does not exist.
- `409 Conflict` — duplicate reference ID or insufficient balance.
- `500 Internal Server Error` — unexpected server or database error.

## Technology Stack

- Node.js
- Express.js
- MySQL
- mysql2
- Raw SQL queries
- Postman

## Repository Structure

```text
conf_pay/
├── example.env
├── design.txt
├── conf.postman_collection.json
├── schema.sql
├── package.json
└── ... application source files
```

The structure above illustrates the expected documentation and configuration files. The actual source filenames may vary.

