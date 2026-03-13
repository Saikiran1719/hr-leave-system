-- ================================================================
--  HR LEAVE MANAGEMENT SYSTEM - SQL SERVER DATABASE SCHEMA
--  Run this in SQL Server Management Studio (SSMS)
-- ================================================================

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'HRLeaveDB')
    CREATE DATABASE HRLeaveDB;
GO

USE HRLeaveDB;
GO

-- ----------------------------------------------------------------
-- DEPARTMENTS
-- ----------------------------------------------------------------
IF OBJECT_ID('dbo.Departments','U') IS NULL
CREATE TABLE dbo.Departments (
    DepartmentID   INT IDENTITY(1,1) PRIMARY KEY,
    DepartmentName NVARCHAR(100)  NOT NULL,
    CreatedAt      DATETIME2      DEFAULT GETDATE()
);
GO

-- ----------------------------------------------------------------
-- USERS
-- ----------------------------------------------------------------
IF OBJECT_ID('dbo.Users','U') IS NULL
CREATE TABLE dbo.Users (
    UserID         INT IDENTITY(1,1) PRIMARY KEY,
    FullName       NVARCHAR(150)  NOT NULL,
    Email          NVARCHAR(200)  NOT NULL UNIQUE,
    PasswordHash   NVARCHAR(500)  NOT NULL,
    Role           NVARCHAR(20)   NOT NULL CHECK (Role IN ('employee','manager','hr')),
    DepartmentID   INT            NULL REFERENCES dbo.Departments(DepartmentID),
    ManagerID      INT            NULL REFERENCES dbo.Users(UserID),
    Phone          NVARCHAR(30)   NULL,
    JoinedDate     DATE           DEFAULT GETDATE(),
    IsActive       BIT            DEFAULT 1,
    ResetToken     NVARCHAR(200)  NULL,
    ResetTokenExp  DATETIME2      NULL,
    CreatedAt      DATETIME2      DEFAULT GETDATE(),
    UpdatedAt      DATETIME2      DEFAULT GETDATE()
);
GO

-- ----------------------------------------------------------------
-- LEAVE TYPES
-- ----------------------------------------------------------------
IF OBJECT_ID('dbo.LeaveTypes','U') IS NULL
CREATE TABLE dbo.LeaveTypes (
    LeaveTypeID    INT IDENTITY(1,1) PRIMARY KEY,
    TypeCode       NVARCHAR(10)   NOT NULL UNIQUE,
    TypeName       NVARCHAR(100)  NOT NULL,
    MaxDaysPerYear INT            NOT NULL,
    ColorHex       NVARCHAR(10)   DEFAULT '#6366f1',
    IsActive       BIT            DEFAULT 1
);
GO

-- ----------------------------------------------------------------
-- LEAVE BALANCES
-- ----------------------------------------------------------------
IF OBJECT_ID('dbo.LeaveBalances','U') IS NULL
CREATE TABLE dbo.LeaveBalances (
    BalanceID      INT IDENTITY(1,1) PRIMARY KEY,
    UserID         INT   NOT NULL REFERENCES dbo.Users(UserID),
    LeaveTypeID    INT   NOT NULL REFERENCES dbo.LeaveTypes(LeaveTypeID),
    Year           INT   NOT NULL DEFAULT YEAR(GETDATE()),
    TotalDays      INT   NOT NULL,
    UsedDays       INT   DEFAULT 0,
    RemainingDays  AS (TotalDays - UsedDays) PERSISTED,
    UpdatedAt      DATETIME2 DEFAULT GETDATE(),
    UNIQUE (UserID, LeaveTypeID, Year)
);
GO

-- ----------------------------------------------------------------
-- LEAVE APPLICATIONS
-- ----------------------------------------------------------------
IF OBJECT_ID('dbo.LeaveApplications','U') IS NULL
CREATE TABLE dbo.LeaveApplications (
    ApplicationID    INT IDENTITY(1,1) PRIMARY KEY,
    UserID           INT             NOT NULL REFERENCES dbo.Users(UserID),
    LeaveTypeID      INT             NOT NULL REFERENCES dbo.LeaveTypes(LeaveTypeID),
    FromDate         DATE            NOT NULL,
    ToDate           DATE            NOT NULL,
    TotalDays        DECIMAL(4,1)    NOT NULL,
    IsHalfDay        BIT             DEFAULT 0,
    HalfDaySession   NVARCHAR(10)    NULL,
    Reason           NVARCHAR(1000)  NOT NULL,
    AttachmentPath   NVARCHAR(500)   NULL,
    Status           NVARCHAR(20)    DEFAULT 'pending' CHECK (Status IN ('pending','approved','rejected','cancelled')),
    ApprovedByID     INT             NULL REFERENCES dbo.Users(UserID),
    ApproverComment  NVARCHAR(500)   NULL,
    ApprovedAt       DATETIME2       NULL,
    AppliedOn        DATETIME2       DEFAULT GETDATE(),
    UpdatedAt        DATETIME2       DEFAULT GETDATE()
);
GO

-- ----------------------------------------------------------------
-- HOLIDAYS
-- ----------------------------------------------------------------
IF OBJECT_ID('dbo.Holidays','U') IS NULL
CREATE TABLE dbo.Holidays (
    HolidayID      INT IDENTITY(1,1) PRIMARY KEY,
    HolidayName    NVARCHAR(150)  NOT NULL,
    HolidayDate    DATE           NOT NULL UNIQUE,
    Year           INT            NOT NULL DEFAULT YEAR(GETDATE()),
    IsOptional     BIT            DEFAULT 0,
    CreatedAt      DATETIME2      DEFAULT GETDATE()
);
GO

-- ----------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------
IF OBJECT_ID('dbo.Notifications','U') IS NULL
CREATE TABLE dbo.Notifications (
    NotifID    INT IDENTITY(1,1) PRIMARY KEY,
    UserID     INT             NOT NULL REFERENCES dbo.Users(UserID),
    Title      NVARCHAR(200)   NOT NULL,
    Message    NVARCHAR(1000)  NOT NULL,
    Type       NVARCHAR(20)    DEFAULT 'info',
    IsRead     BIT             DEFAULT 0,
    RelatedID  INT             NULL,
    CreatedAt  DATETIME2       DEFAULT GETDATE()
);
GO

-- ----------------------------------------------------------------
-- STORED PROCEDURE: Apply Leave
-- ----------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_ApplyLeave
    @UserID         INT,
    @LeaveTypeID    INT,
    @FromDate       DATE,
    @ToDate         DATE,
    @TotalDays      DECIMAL(4,1),
    @IsHalfDay      BIT,
    @HalfDaySession NVARCHAR(10),
    @Reason         NVARCHAR(1000),
    @AttachmentPath NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Remaining DECIMAL(4,1);
    DECLARE @Year INT = YEAR(@FromDate);

    SELECT @Remaining = RemainingDays
    FROM dbo.LeaveBalances
    WHERE UserID=@UserID AND LeaveTypeID=@LeaveTypeID AND Year=@Year;

    IF @Remaining IS NULL OR @Remaining < @TotalDays
    BEGIN SELECT 'INSUFFICIENT_BALANCE' AS Result, 0 AS ApplicationID; RETURN; END

    INSERT INTO dbo.LeaveApplications
        (UserID,LeaveTypeID,FromDate,ToDate,TotalDays,IsHalfDay,HalfDaySession,Reason,AttachmentPath)
    VALUES
        (@UserID,@LeaveTypeID,@FromDate,@ToDate,@TotalDays,@IsHalfDay,@HalfDaySession,@Reason,@AttachmentPath);

    DECLARE @NewID INT = SCOPE_IDENTITY();
    SELECT 'SUCCESS' AS Result, @NewID AS ApplicationID;
END
GO

-- ----------------------------------------------------------------
-- STORED PROCEDURE: Update Leave Status
-- ----------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_UpdateLeaveStatus
    @ApplicationID   INT,
    @Status          NVARCHAR(20),
    @ApprovedByID    INT,
    @ApproverComment NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @UserID INT, @LeaveTypeID INT, @TotalDays DECIMAL(4,1), @FromDate DATE, @OldStatus NVARCHAR(20);

    SELECT @UserID=UserID, @LeaveTypeID=LeaveTypeID, @TotalDays=TotalDays,
           @FromDate=FromDate, @OldStatus=Status
    FROM dbo.LeaveApplications WHERE ApplicationID=@ApplicationID;

    IF @UserID IS NULL BEGIN SELECT 'NOT_FOUND' AS Result; RETURN; END

    UPDATE dbo.LeaveApplications
    SET Status=@Status, ApprovedByID=@ApprovedByID,
        ApproverComment=@ApproverComment, ApprovedAt=GETDATE()
    WHERE ApplicationID=@ApplicationID;

    -- Adjust balance
    IF @Status='approved' AND @OldStatus='pending'
        UPDATE dbo.LeaveBalances SET UsedDays=UsedDays+@TotalDays
        WHERE UserID=@UserID AND LeaveTypeID=@LeaveTypeID AND Year=YEAR(@FromDate);

    IF (@Status='rejected' OR @Status='cancelled') AND @OldStatus='approved'
        UPDATE dbo.LeaveBalances SET UsedDays=UsedDays-@TotalDays
        WHERE UserID=@UserID AND LeaveTypeID=@LeaveTypeID AND Year=YEAR(@FromDate);

    -- Notify employee
    INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
    VALUES(@UserID,
           'Leave ' + @Status,
           'Your leave application has been ' + @Status + ISNULL('. Note: '+@ApproverComment,''),
           CASE @Status WHEN 'approved' THEN 'success' WHEN 'rejected' THEN 'error' ELSE 'info' END,
           @ApplicationID);

    SELECT 'SUCCESS' AS Result;
END
GO

-- ----------------------------------------------------------------
-- SEED DATA
-- ----------------------------------------------------------------

-- Departments
INSERT INTO dbo.Departments (DepartmentName) VALUES
('Engineering'),('Design'),('Human Resources'),('Finance'),('Marketing');
GO

-- Leave Types
INSERT INTO dbo.LeaveTypes (TypeCode,TypeName,MaxDaysPerYear,ColorHex) VALUES
('CL',  'Casual Leave',       12,  '#6366f1'),
('SL',  'Sick Leave',         10,  '#ef4444'),
('EL',  'Earned Leave',       15,  '#10b981'),
('ML',  'Maternity Leave',    180, '#f59e0b'),
('PL',  'Paternity Leave',    15,  '#3b82f6'),
('LWP', 'Leave Without Pay',  30,  '#6b7280'),
('CO',  'Comp Off',           10,  '#8b5cf6'),
('BL',  'Bereavement Leave',  5,   '#14b8a6');
GO

-- Users (run: npm run seed-passwords to hash these)
INSERT INTO dbo.Users (FullName,Email,PasswordHash,Role,DepartmentID,Phone,JoinedDate) VALUES
('Sunita HR',    'hr@acme.com',    'UNHASHED_hr@1234', 'hr',       3, '+91 65432 10987', '2018-01-10'),
('Ravi Menon',   'ravi@acme.com',  'UNHASHED_pass123', 'manager',  1, '+91 76543 21098', '2019-11-20'),
('Arjun Sharma', 'arjun@acme.com', 'UNHASHED_pass123', 'employee', 1, '+91 98765 43210', '2022-03-15'),
('Priya Nair',   'priya@acme.com', 'UNHASHED_pass123', 'employee', 2, '+91 87654 32109', '2021-07-01'),
('Kiran Dev',    'kiran@acme.com', 'UNHASHED_pass123', 'employee', 4, '+91 54321 09876', '2023-02-28');
GO

-- Managers
UPDATE dbo.Users SET ManagerID=(SELECT UserID FROM dbo.Users WHERE Email='ravi@acme.com')
WHERE Email IN ('arjun@acme.com','priya@acme.com');
UPDATE dbo.Users SET ManagerID=(SELECT UserID FROM dbo.Users WHERE Email='hr@acme.com')
WHERE Email IN ('kiran@acme.com','ravi@acme.com');
GO

-- Leave Balances (current year)
DECLARE @CY INT = YEAR(GETDATE());
INSERT INTO dbo.LeaveBalances (UserID,LeaveTypeID,Year,TotalDays)
SELECT U.UserID, LT.LeaveTypeID, @CY, LT.MaxDaysPerYear
FROM dbo.Users U CROSS JOIN dbo.LeaveTypes LT WHERE LT.IsActive=1;
GO

-- Holidays
INSERT INTO dbo.Holidays (HolidayName,HolidayDate,Year) VALUES
('Republic Day',         '2025-01-26', 2025),
('Holi',                 '2025-03-17', 2025),
('Dr. Ambedkar Jayanti', '2025-04-14', 2025),
('Independence Day',     '2025-08-15', 2025),
('Gandhi Jayanti',       '2025-10-02', 2025),
('Dussehra',             '2025-10-23', 2025),
('Diwali',               '2025-11-01', 2025),
('Christmas',            '2025-12-25', 2025);
GO

PRINT 'HRLeaveDB ready!';
GO
