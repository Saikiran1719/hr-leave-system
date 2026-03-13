-- ================================================================
--  HRnova — COMPLETE DATABASE SCHEMA (Master File)
--  SQL Server 2016+ / Azure SQL
--  Run this on a fresh database OR an existing one (all statements
--  are IF NOT EXISTS safe — will not break existing data)
--
--  Order:
--   1. Database
--   2. Core tables (Departments, Users, LeaveTypes, etc.)
--   3. Feature tables (Attendance, Payslip, Assets, etc.)
--   4. Stored Procedures
--   5. Settings seed data
--   6. Default leave types + departments
-- ================================================================

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'HRLeaveDB')
    CREATE DATABASE HRLeaveDB;
GO

USE HRLeaveDB;
GO

-- ================================================================
-- 1. DEPARTMENTS
-- ================================================================
IF OBJECT_ID('dbo.Departments','U') IS NULL
CREATE TABLE dbo.Departments (
    DepartmentID   INT IDENTITY(1,1) PRIMARY KEY,
    DepartmentName NVARCHAR(100) NOT NULL,
    CreatedAt      DATETIME2     DEFAULT GETDATE()
);
GO

-- ================================================================
-- 2. USERS
-- ================================================================
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
    ResetTokenExp  DATETIME       NULL,
    CreatedAt      DATETIME2      DEFAULT GETDATE(),
    UpdatedAt      DATETIME2      DEFAULT GETDATE()
);
GO

-- Employee code (unique, e.g. EMP0001)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Users') AND name='EmployeeCode')
    ALTER TABLE dbo.Users ADD EmployeeCode NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.Users') AND name='UQ_Users_EmployeeCode')
    ALTER TABLE dbo.Users ADD CONSTRAINT UQ_Users_EmployeeCode UNIQUE (EmployeeCode);
GO

-- Date of birth (for birthday feature)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Users') AND name='DateOfBirth')
    ALTER TABLE dbo.Users ADD DateOfBirth DATE NULL;
GO

-- Basic salary (for encashment / payslip)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Users') AND name='BasicSalary')
    ALTER TABLE dbo.Users ADD BasicSalary DECIMAL(12,2) NULL;
GO

-- ================================================================
-- 3. LEAVE TYPES
-- ================================================================
IF OBJECT_ID('dbo.LeaveTypes','U') IS NULL
CREATE TABLE dbo.LeaveTypes (
    LeaveTypeID        INT IDENTITY(1,1) PRIMARY KEY,
    TypeCode           NVARCHAR(10)   NOT NULL UNIQUE,
    TypeName           NVARCHAR(100)  NOT NULL,
    MaxDaysPerYear     INT            NOT NULL,
    ColorHex           NVARCHAR(10)   DEFAULT '#6366f1',
    IsActive           BIT            DEFAULT 1,
    -- Carry forward
    AllowCarryForward  BIT            DEFAULT 0,
    MaxCarryForwardDays INT           DEFAULT 0,
    -- Encashment
    AllowEncashment    BIT            DEFAULT 0,
    IsEncashable       BIT            DEFAULT 0,
    MaxCarryForward    INT            DEFAULT 0,
    EncashRatePerDay   DECIMAL(10,2)  DEFAULT 0
);
GO

-- ================================================================
-- 4. LEAVE BALANCES
-- ================================================================
IF OBJECT_ID('dbo.LeaveBalances','U') IS NULL
CREATE TABLE dbo.LeaveBalances (
    BalanceID          INT IDENTITY(1,1) PRIMARY KEY,
    UserID             INT   NOT NULL REFERENCES dbo.Users(UserID),
    LeaveTypeID        INT   NOT NULL REFERENCES dbo.LeaveTypes(LeaveTypeID),
    Year               INT   NOT NULL DEFAULT YEAR(GETDATE()),
    TotalDays          INT   NOT NULL,
    UsedDays           INT   DEFAULT 0,
    RemainingDays      AS (TotalDays - UsedDays) PERSISTED,
    CarryForwardDays   INT   DEFAULT 0,
    CarriedForwardDays INT   DEFAULT 0,
    EncashedDays       INT   DEFAULT 0,
    UpdatedAt          DATETIME2 DEFAULT GETDATE(),
    UNIQUE (UserID, LeaveTypeID, Year)
);
GO

-- ================================================================
-- 5. LEAVE APPLICATIONS
-- ================================================================
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
    Status           NVARCHAR(20)    DEFAULT 'pending'
                     CHECK (Status IN ('pending','approved','rejected','cancelled')),
    ApprovedByID     INT             NULL REFERENCES dbo.Users(UserID),
    ApproverComment  NVARCHAR(500)   NULL,
    ApprovedAt       DATETIME2       NULL,
    AppliedOn        DATETIME2       DEFAULT GETDATE(),
    UpdatedAt        DATETIME2       DEFAULT GETDATE()
);
GO

-- ================================================================
-- 6. HOLIDAYS
-- ================================================================
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

-- ================================================================
-- 7. NOTIFICATIONS
-- ================================================================
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

-- ================================================================
-- 8. SETTINGS (email, SMTP, company info, attendance config)
-- ================================================================
IF OBJECT_ID('dbo.Settings','U') IS NULL
CREATE TABLE dbo.Settings (
    SettingKey   NVARCHAR(100) PRIMARY KEY,
    SettingValue NVARCHAR(500) NULL,
    UpdatedAt    DATETIME2     DEFAULT GETDATE()
);
GO

-- ================================================================
-- 9. OOD APPLICATIONS (On Official Duty)
-- ================================================================
IF OBJECT_ID('dbo.OODApplications','U') IS NULL
CREATE TABLE dbo.OODApplications (
    OODID          INT IDENTITY(1,1) PRIMARY KEY,
    UserID         INT NOT NULL REFERENCES dbo.Users(UserID),
    FromDate       DATE NOT NULL,
    ToDate         DATE NOT NULL,
    Destination    NVARCHAR(300) NOT NULL,
    Purpose        NVARCHAR(1000) NOT NULL,
    TotalDays      AS DATEDIFF(DAY, FromDate, ToDate) + 1,
    ManagerStatus  NVARCHAR(20) DEFAULT 'pending'
                   CHECK (ManagerStatus IN ('pending','approved','rejected')),
    ManagerID      INT NULL REFERENCES dbo.Users(UserID),
    ManagerComment NVARCHAR(500) NULL,
    ManagerActAt   DATETIME2 NULL,
    HRStatus       NVARCHAR(20) DEFAULT 'pending'
                   CHECK (HRStatus IN ('pending','approved','rejected')),
    HRUserID       INT NULL REFERENCES dbo.Users(UserID),
    HRComment      NVARCHAR(500) NULL,
    HRActAt        DATETIME2 NULL,
    FinalStatus    NVARCHAR(20) DEFAULT 'pending'
                   CHECK (FinalStatus IN ('pending','approved','rejected','cancelled')),
    CreatedAt      DATETIME2 DEFAULT GETDATE(),
    UpdatedAt      DATETIME2 DEFAULT GETDATE()
);
GO

-- ================================================================
-- 10. NOTICES (Company Noticeboard)
-- ================================================================
IF OBJECT_ID('dbo.Notices','U') IS NULL
CREATE TABLE dbo.Notices (
    NoticeID       INT IDENTITY(1,1) PRIMARY KEY,
    Title          NVARCHAR(300)  NOT NULL,
    Body           NVARCHAR(MAX)  NOT NULL,
    Category       NVARCHAR(50)   DEFAULT 'General',
    AttachmentPath NVARCHAR(500)  NULL,
    AttachmentName NVARCHAR(300)  NULL,
    AttachmentType NVARCHAR(20)   NULL,
    CreatedByID    INT            NOT NULL REFERENCES dbo.Users(UserID),
    IsActive       BIT            DEFAULT 1,
    IsPinned       BIT            DEFAULT 0,
    CreatedAt      DATETIME2      DEFAULT GETDATE(),
    UpdatedAt      DATETIME2      DEFAULT GETDATE()
);
GO

IF OBJECT_ID('dbo.NoticeReads','U') IS NULL
CREATE TABLE dbo.NoticeReads (
    ReadID     INT IDENTITY(1,1) PRIMARY KEY,
    NoticeID   INT NOT NULL REFERENCES dbo.Notices(NoticeID),
    UserID     INT NOT NULL REFERENCES dbo.Users(UserID),
    ReadAt     DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT UQ_NoticeRead UNIQUE (NoticeID, UserID)
);
GO

-- ================================================================
-- 11. LEAVE ENCASHMENTS
-- ================================================================
IF OBJECT_ID('dbo.LeaveEncashments','U') IS NULL
CREATE TABLE dbo.LeaveEncashments (
    EncashmentID    INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT NOT NULL REFERENCES dbo.Users(UserID),
    LeaveTypeID     INT NOT NULL REFERENCES dbo.LeaveTypes(LeaveTypeID),
    Year            INT NOT NULL,
    DaysEncashed    DECIMAL(5,1) NOT NULL,
    PerDaySalary    DECIMAL(10,2) NOT NULL,
    TotalAmount     DECIMAL(12,2) NOT NULL,
    Status          NVARCHAR(20) DEFAULT 'pending'
                    CHECK (Status IN ('pending','approved','rejected')),
    RequestedOn     DATETIME2 DEFAULT GETDATE(),
    ProcessedByID   INT NULL REFERENCES dbo.Users(UserID),
    ProcessedOn     DATETIME2 NULL,
    Remarks         NVARCHAR(500) NULL,
    Type            NVARCHAR(20) DEFAULT 'request'  -- 'request' | 'year_end'
);
GO

-- Older table name (keep for backward compat)
IF OBJECT_ID('dbo.LeaveEncashment','U') IS NULL
CREATE TABLE dbo.LeaveEncashment (
    EncashID       INT IDENTITY(1,1) PRIMARY KEY,
    UserID         INT NOT NULL REFERENCES dbo.Users(UserID),
    LeaveTypeID    INT NOT NULL REFERENCES dbo.LeaveTypes(LeaveTypeID),
    Year           INT NOT NULL,
    DaysRequested  INT NOT NULL,
    RatePerDay     DECIMAL(10,2) DEFAULT 0,
    TotalAmount    AS (DaysRequested * RatePerDay) PERSISTED,
    Status         NVARCHAR(20) DEFAULT 'pending',
    ApprovedByID   INT NULL REFERENCES dbo.Users(UserID),
    Comment        NVARCHAR(500) NULL,
    ProcessedAt    DATETIME2 NULL,
    CreatedAt      DATETIME2 DEFAULT GETDATE()
);
GO

-- Carry forward audit trail
IF OBJECT_ID('dbo.LeaveCarryForwards','U') IS NULL
CREATE TABLE dbo.LeaveCarryForwards (
    CarryID         INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT NOT NULL REFERENCES dbo.Users(UserID),
    LeaveTypeID     INT NOT NULL REFERENCES dbo.LeaveTypes(LeaveTypeID),
    FromYear        INT NOT NULL,
    ToYear          INT NOT NULL,
    DaysCarried     DECIMAL(5,1) NOT NULL,
    ProcessedByID   INT NOT NULL REFERENCES dbo.Users(UserID),
    ProcessedOn     DATETIME2 DEFAULT GETDATE()
);
GO

-- ================================================================
-- 12. AUDIT LOG
-- ================================================================
IF OBJECT_ID('dbo.AuditLog','U') IS NULL
CREATE TABLE dbo.AuditLog (
    LogID       INT IDENTITY(1,1) PRIMARY KEY,
    UserID      INT NULL REFERENCES dbo.Users(UserID),
    Action      NVARCHAR(100) NOT NULL,
    Entity      NVARCHAR(50)  NOT NULL,
    EntityID    INT NULL,
    OldValue    NVARCHAR(MAX) NULL,
    NewValue    NVARCHAR(MAX) NULL,
    IPAddress   NVARCHAR(50)  NULL,
    UserAgent   NVARCHAR(300) NULL,
    CreatedAt   DATETIME2 DEFAULT GETDATE()
);
GO

-- ================================================================
-- 13. BIRTHDAY FEATURES
-- ================================================================
IF OBJECT_ID('dbo.BirthdayWishes','U') IS NULL
CREATE TABLE dbo.BirthdayWishes (
    WishID       INT IDENTITY(1,1) PRIMARY KEY,
    ToUserID     INT NOT NULL REFERENCES dbo.Users(UserID),
    FromUserID   INT NOT NULL REFERENCES dbo.Users(UserID),
    WishText     NVARCHAR(500) NOT NULL,
    WishYear     INT NOT NULL DEFAULT YEAR(GETDATE()),
    CreatedAt    DATETIME2 DEFAULT GETDATE()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UQ_BirthdayWish_PerYear')
    ALTER TABLE dbo.BirthdayWishes
    ADD CONSTRAINT UQ_BirthdayWish_PerYear UNIQUE (ToUserID, FromUserID, WishYear);
GO

IF OBJECT_ID('dbo.BirthdayNotified','U') IS NULL
CREATE TABLE dbo.BirthdayNotified (
    NotifID    INT IDENTITY(1,1) PRIMARY KEY,
    UserID     INT NOT NULL REFERENCES dbo.Users(UserID),
    BirthYear  INT NOT NULL,
    NotifiedAt DATETIME2 DEFAULT GETDATE()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UQ_BirthdayNotified_Year')
    ALTER TABLE dbo.BirthdayNotified
    ADD CONSTRAINT UQ_BirthdayNotified_Year UNIQUE (UserID, BirthYear);
GO

-- ================================================================
-- 14. SALARY STRUCTURE + PAYSLIPS
-- ================================================================
IF OBJECT_ID('dbo.SalaryStructure','U') IS NULL
CREATE TABLE dbo.SalaryStructure (
    SalaryID       INT IDENTITY(1,1) PRIMARY KEY,
    UserID         INT NOT NULL REFERENCES dbo.Users(UserID),
    BasicSalary    DECIMAL(12,2) NOT NULL DEFAULT 0,
    HRA            DECIMAL(12,2) DEFAULT 0,
    DA             DECIMAL(12,2) DEFAULT 0,
    TA             DECIMAL(12,2) DEFAULT 0,
    OtherAllowance DECIMAL(12,2) DEFAULT 0,
    PFDeduction    DECIMAL(12,2) DEFAULT 0,
    ESIDeduction   DECIMAL(12,2) DEFAULT 0,
    TaxDeduction   DECIMAL(12,2) DEFAULT 0,
    OtherDeduction DECIMAL(12,2) DEFAULT 0,
    EffectiveFrom  DATE NOT NULL DEFAULT GETDATE(),
    IsActive       BIT DEFAULT 1,
    UpdatedAt      DATETIME2 DEFAULT GETDATE(),
    UpdatedByID    INT NULL REFERENCES dbo.Users(UserID)
);
GO

IF OBJECT_ID('dbo.Payslips','U') IS NULL
CREATE TABLE dbo.Payslips (
    PayslipID      INT IDENTITY(1,1) PRIMARY KEY,
    UserID         INT NOT NULL REFERENCES dbo.Users(UserID),
    Month          INT NOT NULL,
    Year           INT NOT NULL,
    -- Attendance
    WorkingDays    INT DEFAULT 0,
    PresentDays    INT DEFAULT 0,
    AbsentDays     INT DEFAULT 0,
    LeaveDays      INT DEFAULT 0,
    OODDays        INT DEFAULT 0,
    LateDays       INT DEFAULT 0,
    -- Earnings
    BasicSalary    DECIMAL(12,2) DEFAULT 0,
    HRA            DECIMAL(12,2) DEFAULT 0,
    DA             DECIMAL(12,2) DEFAULT 0,
    TA             DECIMAL(12,2) DEFAULT 0,
    OtherAllowance DECIMAL(12,2) DEFAULT 0,
    GrossSalary    DECIMAL(12,2) DEFAULT 0,
    -- Deductions
    PFDeduction    DECIMAL(12,2) DEFAULT 0,
    ESIDeduction   DECIMAL(12,2) DEFAULT 0,
    TaxDeduction   DECIMAL(12,2) DEFAULT 0,
    LopDeduction   DECIMAL(12,2) DEFAULT 0,
    OtherDeduction DECIMAL(12,2) DEFAULT 0,
    TotalDeduction DECIMAL(12,2) DEFAULT 0,
    -- Net
    NetSalary      DECIMAL(12,2) DEFAULT 0,
    -- Meta
    Status         NVARCHAR(20) DEFAULT 'draft',
    GeneratedByID  INT NULL REFERENCES dbo.Users(UserID),
    GeneratedAt    DATETIME2 DEFAULT GETDATE(),
    PublishedAt    DATETIME2 NULL,
    Remarks        NVARCHAR(500) NULL,
    UNIQUE (UserID, Month, Year)
);
GO

-- ================================================================
-- 15. SHIFTS + SHIFT ASSIGNMENTS
-- ================================================================
IF OBJECT_ID('dbo.Shifts','U') IS NULL
CREATE TABLE dbo.Shifts (
    ShiftID        INT IDENTITY(1,1) PRIMARY KEY,
    ShiftName      NVARCHAR(100) NOT NULL,
    ShiftCode      NVARCHAR(20)  NOT NULL UNIQUE,
    StartTime      TIME NOT NULL,
    EndTime        TIME NOT NULL,
    GraceLateMin   INT DEFAULT 15,
    GraceEarlyMin  INT DEFAULT 15,
    WorkMinutes    INT DEFAULT 480,
    ColorHex       NVARCHAR(10) DEFAULT '#6366f1',
    IsNightShift   BIT DEFAULT 0,
    IsActive       BIT DEFAULT 1,
    CreatedAt      DATETIME2 DEFAULT GETDATE()
);
GO

IF OBJECT_ID('dbo.ShiftAssignments','U') IS NULL
CREATE TABLE dbo.ShiftAssignments (
    AssignID       INT IDENTITY(1,1) PRIMARY KEY,
    UserID         INT NOT NULL REFERENCES dbo.Users(UserID),
    ShiftID        INT NOT NULL REFERENCES dbo.Shifts(ShiftID),
    EffectiveFrom  DATE NOT NULL DEFAULT GETDATE(),
    EffectiveTo    DATE NULL,
    AssignedByID   INT NULL REFERENCES dbo.Users(UserID),
    CreatedAt      DATETIME2 DEFAULT GETDATE()
);
GO

-- ================================================================
-- 16. ASSET MANAGEMENT
-- ================================================================
IF OBJECT_ID('dbo.AssetCategories','U') IS NULL
CREATE TABLE dbo.AssetCategories (
    CategoryID   INT IDENTITY(1,1) PRIMARY KEY,
    CategoryName NVARCHAR(100) NOT NULL,
    Icon         NVARCHAR(10)  DEFAULT '[OTH]'
);
GO

IF OBJECT_ID('dbo.Assets','U') IS NULL
CREATE TABLE dbo.Assets (
    AssetID        INT IDENTITY(1,1) PRIMARY KEY,
    AssetCode      NVARCHAR(50)  NOT NULL UNIQUE,
    AssetName      NVARCHAR(200) NOT NULL,
    CategoryID     INT NULL REFERENCES dbo.AssetCategories(CategoryID),
    Brand          NVARCHAR(100) NULL,
    Model          NVARCHAR(100) NULL,
    SerialNumber   NVARCHAR(200) NULL,
    PurchaseDate   DATE NULL,
    PurchasePrice  DECIMAL(12,2) NULL,
    WarrantyUntil  DATE NULL,
    Status         NVARCHAR(20) DEFAULT 'available',
                   -- available / assigned / maintenance / retired
    Condition      NVARCHAR(20) DEFAULT 'good',
    Notes          NVARCHAR(500) NULL,
    CreatedAt      DATETIME2 DEFAULT GETDATE(),
    UpdatedAt      DATETIME2 DEFAULT GETDATE()
);
GO

IF OBJECT_ID('dbo.AssetAssignments','U') IS NULL
CREATE TABLE dbo.AssetAssignments (
    AssignID       INT IDENTITY(1,1) PRIMARY KEY,
    AssetID        INT NOT NULL REFERENCES dbo.Assets(AssetID),
    UserID         INT NOT NULL REFERENCES dbo.Users(UserID),
    AssignedDate   DATE NOT NULL DEFAULT GETDATE(),
    ReturnedDate   DATE NULL,
    AssignedByID   INT NULL REFERENCES dbo.Users(UserID),
    ReturnedToID   INT NULL REFERENCES dbo.Users(UserID),
    Condition      NVARCHAR(20) DEFAULT 'good',
    Notes          NVARCHAR(500) NULL,
    IsActive       BIT DEFAULT 1,
    CreatedAt      DATETIME2 DEFAULT GETDATE()
);
GO

-- ================================================================
-- 17. PERFORMANCE REVIEW
-- ================================================================
IF OBJECT_ID('dbo.ReviewCycles','U') IS NULL
CREATE TABLE dbo.ReviewCycles (
    CycleID        INT IDENTITY(1,1) PRIMARY KEY,
    CycleName      NVARCHAR(200) NOT NULL,
    ReviewType     NVARCHAR(50)  DEFAULT 'annual',
    StartDate      DATE NOT NULL,
    EndDate        DATE NOT NULL,
    Status         NVARCHAR(20)  DEFAULT 'draft',
    CreatedByID    INT NULL REFERENCES dbo.Users(UserID),
    CreatedAt      DATETIME2 DEFAULT GETDATE()
);
GO

IF OBJECT_ID('dbo.ReviewForms','U') IS NULL
CREATE TABLE dbo.ReviewForms (
    FormID         INT IDENTITY(1,1) PRIMARY KEY,
    CycleID        INT NOT NULL REFERENCES dbo.ReviewCycles(CycleID),
    EmployeeID     INT NOT NULL REFERENCES dbo.Users(UserID),
    ReviewerID     INT NOT NULL REFERENCES dbo.Users(UserID),
    Status         NVARCHAR(20) DEFAULT 'pending',
    -- Self Assessment
    SelfGoals      NVARCHAR(MAX) NULL,
    SelfAchieve    NVARCHAR(MAX) NULL,
    SelfStrengths  NVARCHAR(MAX) NULL,
    SelfImprove    NVARCHAR(MAX) NULL,
    SelfRating     INT NULL CHECK (SelfRating BETWEEN 1 AND 5),
    SelfSubmitAt   DATETIME2 NULL,
    -- Manager Review
    MgrGoals       NVARCHAR(MAX) NULL,
    MgrAchieve     NVARCHAR(MAX) NULL,
    MgrStrengths   NVARCHAR(MAX) NULL,
    MgrImprove     NVARCHAR(MAX) NULL,
    MgrRating      INT NULL CHECK (MgrRating BETWEEN 1 AND 5),
    MgrComment     NVARCHAR(MAX) NULL,
    MgrReviewAt    DATETIME2 NULL,
    -- HR Final
    HRRating       INT NULL CHECK (HRRating BETWEEN 1 AND 5),
    HRComment      NVARCHAR(MAX) NULL,
    FinalRating    NVARCHAR(20) NULL,
    HRReviewAt     DATETIME2 NULL,
    -- Acknowledgement
    EmpAckAt       DATETIME2 NULL,
    EmpAckComment  NVARCHAR(500) NULL,
    CreatedAt      DATETIME2 DEFAULT GETDATE(),
    UNIQUE (CycleID, EmployeeID)
);
GO

-- ================================================================
-- 18. EXIT MANAGEMENT
-- ================================================================
IF OBJECT_ID('dbo.ExitRequests','U') IS NULL
CREATE TABLE dbo.ExitRequests (
    ExitID            INT IDENTITY(1,1) PRIMARY KEY,
    UserID            INT NOT NULL REFERENCES dbo.Users(UserID),
    ResignDate        DATE NOT NULL,
    LastWorkingDay    DATE NULL,
    NoticePeriodDays  INT DEFAULT 30,
    Reason            NVARCHAR(100) NOT NULL,
    Remarks           NVARCHAR(1000) NULL,
    Status            NVARCHAR(30) DEFAULT 'submitted',
    AcceptedByID      INT NULL REFERENCES dbo.Users(UserID),
    AcceptedAt        DATETIME2 NULL,
    HRComment         NVARCHAR(500) NULL,
    -- Checklist
    AssetsReturned    BIT DEFAULT 0,
    AccessRevoked     BIT DEFAULT 0,
    FnFProcessed      BIT DEFAULT 0,
    ExitInterview     BIT DEFAULT 0,
    ExitInterviewNote NVARCHAR(MAX) NULL,
    -- F&F
    FnFAmount         DECIMAL(12,2) NULL,
    FnFDate           DATE NULL,
    FnFNote           NVARCHAR(500) NULL,
    CreatedAt         DATETIME2 DEFAULT GETDATE(),
    UpdatedAt         DATETIME2 DEFAULT GETDATE()
);
GO

-- ================================================================
-- 19. ATTENDANCE (Raw Logs + Daily Summary)
-- ================================================================
IF OBJECT_ID('dbo.AttendanceLogs','U') IS NULL
CREATE TABLE dbo.AttendanceLogs (
    LogID        BIGINT IDENTITY(1,1) PRIMARY KEY,
    UserID       INT          NOT NULL REFERENCES dbo.Users(UserID),
    PunchTime    DATETIME2    NOT NULL,   -- Store as IST local time (no Z suffix)
    PunchType    NVARCHAR(3)  NOT NULL CHECK (PunchType IN ('IN','OUT','BRK')),
    DeviceID     NVARCHAR(50) NULL,
    EsslLogID    NVARCHAR(50) NULL,
    Source       NVARCHAR(20) DEFAULT 'MANUAL',  -- MANUAL / CSV / ESSL_SYNC / FACE
    CreatedAt    DATETIME2    DEFAULT GETDATE(),
    UNIQUE (UserID, PunchTime)
);
GO

IF OBJECT_ID('dbo.AttendanceSummary','U') IS NULL
CREATE TABLE dbo.AttendanceSummary (
    SummaryID      INT IDENTITY(1,1) PRIMARY KEY,
    UserID         INT      NOT NULL REFERENCES dbo.Users(UserID),
    AttDate        DATE     NOT NULL,
    FirstIn        TIME     NULL,          -- IST local time
    LastOut        TIME     NULL,          -- IST local time
    WorkMinutes    INT      NULL,
    Status         NVARCHAR(20) NOT NULL DEFAULT 'ABSENT',
                   -- PRESENT | LATE | EARLY_EXIT | LATE_EARLY |
                   -- HALF_DAY | ABSENT | ON_LEAVE | HOLIDAY | WEEKEND
    IsLate         BIT      DEFAULT 0,
    IsEarlyExit    BIT      DEFAULT 0,
    LateMinutes    INT      DEFAULT 0,
    EarlyExitMins  INT      DEFAULT 0,
    LeaveType      NVARCHAR(50) NULL,
    Notes          NVARCHAR(200) NULL,
    ComputedAt     DATETIME2 DEFAULT GETDATE(),
    UNIQUE (UserID, AttDate)
);
GO

-- ================================================================
-- 20. FACE ATTENDANCE
-- ================================================================
IF OBJECT_ID('dbo.FaceDescriptors','U') IS NULL
CREATE TABLE dbo.FaceDescriptors (
    FaceID         INT IDENTITY(1,1) PRIMARY KEY,
    UserID         INT NOT NULL REFERENCES dbo.Users(UserID),
    Descriptor     NVARCHAR(MAX) NOT NULL,  -- JSON array of 128 floats
    PhotoBase64    NVARCHAR(MAX) NULL,
    EnrolledByID   INT NULL REFERENCES dbo.Users(UserID),
    EnrolledAt     DATETIME2 DEFAULT GETDATE(),
    IsActive       BIT DEFAULT 1
);
GO

IF OBJECT_ID('dbo.FacePunches','U') IS NULL
CREATE TABLE dbo.FacePunches (
    PunchID        INT IDENTITY(1,1) PRIMARY KEY,
    UserID         INT NOT NULL REFERENCES dbo.Users(UserID),
    PunchType      NVARCHAR(10) NOT NULL,
    PunchTime      DATETIME2 DEFAULT GETDATE(),
    Confidence     DECIMAL(5,4) NULL,
    PhotoBase64    NVARCHAR(MAX) NULL,
    DeviceInfo     NVARCHAR(200) NULL,
    CreatedAt      DATETIME2 DEFAULT GETDATE()
);
GO

-- ================================================================
-- 21. STORED PROCEDURE: sp_ApplyLeave
-- ================================================================
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

-- ================================================================
-- 22. STORED PROCEDURE: sp_UpdateLeaveStatus
-- ================================================================
CREATE OR ALTER PROCEDURE dbo.sp_UpdateLeaveStatus
    @ApplicationID   INT,
    @Status          NVARCHAR(20),
    @ApprovedByID    INT,
    @ApproverComment NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @UserID INT, @LeaveTypeID INT, @TotalDays DECIMAL(4,1),
            @FromDate DATE, @OldStatus NVARCHAR(20);

    SELECT @UserID=UserID, @LeaveTypeID=LeaveTypeID, @TotalDays=TotalDays,
           @FromDate=FromDate, @OldStatus=Status
    FROM dbo.LeaveApplications WHERE ApplicationID=@ApplicationID;

    IF @UserID IS NULL BEGIN SELECT 'NOT_FOUND' AS Result; RETURN; END

    UPDATE dbo.LeaveApplications
    SET Status=@Status, ApprovedByID=@ApprovedByID,
        ApproverComment=@ApproverComment, ApprovedAt=GETDATE()
    WHERE ApplicationID=@ApplicationID;

    IF @Status='approved' AND @OldStatus='pending'
        UPDATE dbo.LeaveBalances SET UsedDays=UsedDays+@TotalDays
        WHERE UserID=@UserID AND LeaveTypeID=@LeaveTypeID AND Year=YEAR(@FromDate);

    IF (@Status='rejected' OR @Status='cancelled') AND @OldStatus='approved'
        UPDATE dbo.LeaveBalances SET UsedDays=UsedDays-@TotalDays
        WHERE UserID=@UserID AND LeaveTypeID=@LeaveTypeID AND Year=YEAR(@FromDate);

    INSERT INTO dbo.Notifications(UserID,Title,Message,Type,RelatedID)
    VALUES(@UserID,
           'Leave ' + @Status,
           'Your leave application has been ' + @Status +
           ISNULL('. Note: ' + @ApproverComment, ''),
           CASE @Status WHEN 'approved' THEN 'success'
                        WHEN 'rejected' THEN 'error' ELSE 'info' END,
           @ApplicationID);

    SELECT 'SUCCESS' AS Result;
END
GO

-- ================================================================
-- 23. STORED PROCEDURE: sp_ComputeAttendance
--     Recomputes AttendanceSummary from raw AttendanceLogs
--     Shift: 08:30–17:00 | Grace: ±15 min | Full day: 8h (480 min)
-- ================================================================
IF OBJECT_ID('dbo.sp_ComputeAttendance','P') IS NOT NULL
    DROP PROC dbo.sp_ComputeAttendance;
GO

CREATE PROC dbo.sp_ComputeAttendance
    @FromDate DATE,
    @ToDate   DATE
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @ShiftStart  TIME = '08:30';
  DECLARE @ShiftEnd    TIME = '17:00';
  DECLARE @GraceLate   INT  = 15;
  DECLARE @GraceEarly  INT  = 15;
  DECLARE @WorkMins    INT  = 480;
  DECLARE @LunchMins   INT  = 30;
  DECLARE @LateBy      TIME = DATEADD(MINUTE, @GraceLate,   @ShiftStart);
  DECLARE @EarlyBy     TIME = DATEADD(MINUTE, -@GraceEarly, @ShiftEnd);

  DECLARE @d DATE = @FromDate;
  WHILE @d <= @ToDate
  BEGIN
    -- SUNDAY = week off (WEEKDAY 1 = Sunday in default SQL Server)
    IF DATEPART(WEEKDAY, @d) = 1
    BEGIN
      MERGE dbo.AttendanceSummary AS tgt
      USING (SELECT UserID FROM dbo.Users WHERE IsActive=1) AS src
        ON tgt.UserID=src.UserID AND tgt.AttDate=@d
      WHEN MATCHED THEN
        UPDATE SET Status='WEEKEND', ComputedAt=GETDATE()
      WHEN NOT MATCHED THEN
        INSERT(UserID,AttDate,Status,ComputedAt)
        VALUES(src.UserID,@d,'WEEKEND',GETDATE());
      SET @d = DATEADD(DAY,1,@d); CONTINUE;
    END

    -- Public Holiday
    IF EXISTS (SELECT 1 FROM dbo.Holidays WHERE CAST(HolidayDate AS DATE)=@d)
    BEGIN
      DECLARE @HolName NVARCHAR(200);
      SELECT @HolName=HolidayName FROM dbo.Holidays WHERE CAST(HolidayDate AS DATE)=@d;
      MERGE dbo.AttendanceSummary AS tgt
      USING (SELECT UserID FROM dbo.Users WHERE IsActive=1) AS src
        ON tgt.UserID=src.UserID AND tgt.AttDate=@d
      WHEN MATCHED THEN
        UPDATE SET Status='HOLIDAY', LeaveType=@HolName, ComputedAt=GETDATE()
      WHEN NOT MATCHED THEN
        INSERT(UserID,AttDate,Status,LeaveType,ComputedAt)
        VALUES(src.UserID,@d,'HOLIDAY',@HolName,GETDATE());
      SET @d = DATEADD(DAY,1,@d); CONTINUE;
    END

    -- Working day: compute from punches
    MERGE dbo.AttendanceSummary AS tgt
    USING (
      SELECT
        u.UserID, @d AS AttDate,
        MIN(CASE WHEN al.PunchType='IN'  THEN CAST(al.PunchTime AS TIME) END) AS FirstIn,
        MAX(CASE WHEN al.PunchType='OUT' THEN CAST(al.PunchTime AS TIME) END) AS LastOut,
        CASE
          WHEN MIN(CASE WHEN al.PunchType='IN'  THEN al.PunchTime END) IS NULL THEN NULL
          WHEN MAX(CASE WHEN al.PunchType='OUT' THEN al.PunchTime END) IS NULL THEN NULL
          ELSE
            DATEDIFF(MINUTE,
              MIN(CASE WHEN al.PunchType='IN'  THEN al.PunchTime END),
              MAX(CASE WHEN al.PunchType='OUT' THEN al.PunchTime END))
            - CASE WHEN DATEDIFF(MINUTE,
                MIN(CASE WHEN al.PunchType='IN'  THEN al.PunchTime END),
                MAX(CASE WHEN al.PunchType='OUT' THEN al.PunchTime END)) >= 300
              THEN @LunchMins ELSE 0 END
        END AS WorkMinutes,
        MAX(CASE WHEN la.Status='approved' THEN lt.TypeName END) AS LeaveType,
        CASE
          WHEN MAX(CASE WHEN la.Status='approved' THEN 1 ELSE 0 END)=1 THEN 'ON_LEAVE'
          WHEN MIN(CASE WHEN al.PunchType='IN' THEN CAST(al.PunchTime AS TIME) END) IS NULL THEN 'ABSENT'
          ELSE
            CASE
              WHEN MIN(CASE WHEN al.PunchType='IN' THEN CAST(al.PunchTime AS TIME) END) > @LateBy
               AND MAX(CASE WHEN al.PunchType='OUT' THEN CAST(al.PunchTime AS TIME) END) < @EarlyBy
               AND (DATEDIFF(MINUTE,
                    MIN(CASE WHEN al.PunchType='IN' THEN al.PunchTime END),
                    MAX(CASE WHEN al.PunchType='OUT' THEN al.PunchTime END))
                  - CASE WHEN DATEDIFF(MINUTE,
                      MIN(CASE WHEN al.PunchType='IN' THEN al.PunchTime END),
                      MAX(CASE WHEN al.PunchType='OUT' THEN al.PunchTime END)) >= 300
                    THEN @LunchMins ELSE 0 END) < @WorkMins
              THEN 'LATE_EARLY'
              WHEN MIN(CASE WHEN al.PunchType='IN' THEN CAST(al.PunchTime AS TIME) END) > @LateBy
              THEN 'LATE'
              WHEN MAX(CASE WHEN al.PunchType='OUT' THEN CAST(al.PunchTime AS TIME) END) < @EarlyBy
               AND (DATEDIFF(MINUTE,
                    MIN(CASE WHEN al.PunchType='IN' THEN al.PunchTime END),
                    MAX(CASE WHEN al.PunchType='OUT' THEN al.PunchTime END))
                  - CASE WHEN DATEDIFF(MINUTE,
                      MIN(CASE WHEN al.PunchType='IN' THEN al.PunchTime END),
                      MAX(CASE WHEN al.PunchType='OUT' THEN al.PunchTime END)) >= 300
                    THEN @LunchMins ELSE 0 END) < @WorkMins
              THEN 'EARLY_EXIT'
              ELSE 'PRESENT'
            END
        END AS Status,
        CASE WHEN MIN(CASE WHEN al.PunchType='IN' THEN CAST(al.PunchTime AS TIME) END) > @LateBy
          THEN 1 ELSE 0 END AS IsLate,
        CASE WHEN
          MAX(CASE WHEN al.PunchType='OUT' THEN CAST(al.PunchTime AS TIME) END) < @EarlyBy
          AND (DATEDIFF(MINUTE,
                MIN(CASE WHEN al.PunchType='IN' THEN al.PunchTime END),
                MAX(CASE WHEN al.PunchType='OUT' THEN al.PunchTime END))
              - CASE WHEN DATEDIFF(MINUTE,
                  MIN(CASE WHEN al.PunchType='IN' THEN al.PunchTime END),
                  MAX(CASE WHEN al.PunchType='OUT' THEN al.PunchTime END)) >= 300
                THEN @LunchMins ELSE 0 END) < @WorkMins
          THEN 1 ELSE 0 END AS IsEarlyExit,
        CASE WHEN MIN(CASE WHEN al.PunchType='IN' THEN CAST(al.PunchTime AS TIME) END) > @LateBy
          THEN DATEDIFF(MINUTE,@ShiftStart,
               MIN(CASE WHEN al.PunchType='IN' THEN CAST(al.PunchTime AS TIME) END))
          ELSE 0 END AS LateMinutes,
        CASE WHEN
          MAX(CASE WHEN al.PunchType='OUT' THEN CAST(al.PunchTime AS TIME) END) < @EarlyBy
          AND (DATEDIFF(MINUTE,
                MIN(CASE WHEN al.PunchType='IN' THEN al.PunchTime END),
                MAX(CASE WHEN al.PunchType='OUT' THEN al.PunchTime END))
              - CASE WHEN DATEDIFF(MINUTE,
                  MIN(CASE WHEN al.PunchType='IN' THEN al.PunchTime END),
                  MAX(CASE WHEN al.PunchType='OUT' THEN al.PunchTime END)) >= 300
                THEN @LunchMins ELSE 0 END) < @WorkMins
          THEN DATEDIFF(MINUTE,
               MAX(CASE WHEN al.PunchType='OUT' THEN CAST(al.PunchTime AS TIME) END),
               @ShiftEnd)
          ELSE 0 END AS EarlyExitMins
      FROM dbo.Users u
      LEFT JOIN dbo.AttendanceLogs al
        ON al.UserID=u.UserID AND CAST(al.PunchTime AS DATE)=@d
      LEFT JOIN dbo.LeaveApplications la
        ON la.UserID=u.UserID
        AND @d BETWEEN CAST(la.FromDate AS DATE) AND CAST(la.ToDate AS DATE)
        AND la.Status='approved'
      LEFT JOIN dbo.LeaveTypes lt ON lt.LeaveTypeID=la.LeaveTypeID
      WHERE u.IsActive=1
      GROUP BY u.UserID
    ) AS src ON tgt.UserID=src.UserID AND tgt.AttDate=@d
    WHEN MATCHED THEN UPDATE SET
      FirstIn=src.FirstIn, LastOut=src.LastOut, WorkMinutes=src.WorkMinutes,
      Status=src.Status, IsLate=src.IsLate, IsEarlyExit=src.IsEarlyExit,
      LateMinutes=src.LateMinutes, EarlyExitMins=src.EarlyExitMins,
      LeaveType=src.LeaveType, ComputedAt=GETDATE()
    WHEN NOT MATCHED THEN INSERT
      (UserID,AttDate,FirstIn,LastOut,WorkMinutes,Status,IsLate,IsEarlyExit,
       LateMinutes,EarlyExitMins,LeaveType,ComputedAt)
    VALUES(src.UserID,src.AttDate,src.FirstIn,src.LastOut,src.WorkMinutes,
           src.Status,src.IsLate,src.IsEarlyExit,src.LateMinutes,
           src.EarlyExitMins,src.LeaveType,GETDATE());

    SET @d = DATEADD(DAY,1,@d);
  END
END
GO

-- ================================================================
-- 24. SETTINGS SEED DATA
-- ================================================================
-- Email
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='email_on_application')
    INSERT INTO dbo.Settings VALUES('email_on_application','false',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='email_on_approval')
    INSERT INTO dbo.Settings VALUES('email_on_approval','false',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='smtp_host')
    INSERT INTO dbo.Settings VALUES('smtp_host','smtp.gmail.com',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='smtp_port')
    INSERT INTO dbo.Settings VALUES('smtp_port','587',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='smtp_user')
    INSERT INTO dbo.Settings VALUES('smtp_user','',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='smtp_pass')
    INSERT INTO dbo.Settings VALUES('smtp_pass','',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='smtp_from_name')
    INSERT INTO dbo.Settings VALUES('smtp_from_name','HRnova',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='smtp_from')
    INSERT INTO dbo.Settings VALUES('smtp_from','',GETDATE());
-- Company
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='company_name')
    INSERT INTO dbo.Settings VALUES('company_name','Your Company Pvt Ltd',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='company_address')
    INSERT INTO dbo.Settings VALUES('company_address','123 Business Park, City - 560001',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='company_pan')
    INSERT INTO dbo.Settings VALUES('company_pan','ABCDE1234F',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='company_pf_number')
    INSERT INTO dbo.Settings VALUES('company_pf_number','PF/KA/12345',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='portal_url')
    INSERT INTO dbo.Settings VALUES('portal_url','http://localhost:3000',GETDATE());
-- Attendance shift config
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='att_shift_start')
    INSERT INTO dbo.Settings VALUES('att_shift_start','08:30',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='att_shift_end')
    INSERT INTO dbo.Settings VALUES('att_shift_end','17:00',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='att_grace_late')
    INSERT INTO dbo.Settings VALUES('att_grace_late','15',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='att_grace_early')
    INSERT INTO dbo.Settings VALUES('att_grace_early','15',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='att_work_minutes')
    INSERT INTO dbo.Settings VALUES('att_work_minutes','480',GETDATE());
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey='att_lunch_minutes')
    INSERT INTO dbo.Settings VALUES('att_lunch_minutes','30',GETDATE());
GO

-- ================================================================
-- 25. DEFAULT SEED DATA
-- ================================================================
-- Departments
IF NOT EXISTS (SELECT 1 FROM dbo.Departments)
INSERT INTO dbo.Departments (DepartmentName) VALUES
('Engineering'),('Design'),('Human Resources'),('Finance'),('Marketing'),
('Sales'),('Operations'),('IT');
GO

-- Leave Types
IF NOT EXISTS (SELECT 1 FROM dbo.LeaveTypes)
INSERT INTO dbo.LeaveTypes
    (TypeCode,TypeName,MaxDaysPerYear,ColorHex,AllowCarryForward,MaxCarryForwardDays,AllowEncashment,IsEncashable,EncashRatePerDay)
VALUES
('CL',  'Casual Leave',       12,  '#6366f1', 0, 0,  1, 1, 500),
('SL',  'Sick Leave',         10,  '#ef4444', 0, 0,  0, 0, 0),
('EL',  'Earned Leave',       15,  '#10b981', 1, 15, 1, 1, 0),
('ML',  'Maternity Leave',    180, '#f59e0b', 0, 0,  0, 0, 0),
('PL',  'Paternity Leave',    15,  '#3b82f6', 1, 10, 1, 1, 0),
('LWP', 'Leave Without Pay',  30,  '#6b7280', 0, 0,  0, 0, 0),
('CO',  'Comp Off',           10,  '#8b5cf6', 0, 0,  0, 0, 0),
('BL',  'Bereavement Leave',  5,   '#14b8a6', 0, 0,  0, 0, 0);
GO

-- Default Shifts
IF NOT EXISTS (SELECT 1 FROM dbo.Shifts)
INSERT INTO dbo.Shifts (ShiftName,ShiftCode,StartTime,EndTime,GraceLateMin,GraceEarlyMin,WorkMinutes,ColorHex,IsNightShift)
VALUES
('General Shift', 'GEN',   '08:30','17:00',15,15,480,'#6366f1',0),
('Morning Shift', 'MORN',  '06:00','14:00',15,15,480,'#0ea5e9',0),
('Evening Shift', 'EVE',   '14:00','22:00',15,15,480,'#f59e0b',0),
('Night Shift',   'NIGHT', '22:00','06:00',15,15,480,'#7c3aed',1);
GO

-- Asset Categories
IF NOT EXISTS (SELECT 1 FROM dbo.AssetCategories)
INSERT INTO dbo.AssetCategories(CategoryName,Icon) VALUES
('Laptop','[PC]'),('Mobile Phone','[MOB]'),('Desktop','[DSK]'),
('Headset','[AUD]'),('Mouse & Keyboard','[KEY]'),
('Vehicle','[VEH]'),('Access Card','[CRD]'),('Other','[OTH]');
GO

-- ================================================================
-- 26. ONE-TIME DATA FIX: If you imported CSV punches before the
--     IST fix was applied, run this to correct UTC → IST (+5:30)
--     IMPORTANT: Only run ONCE. Check results before committing.
-- ================================================================
-- BEGIN TRANSACTION;
--   UPDATE dbo.AttendanceLogs
--   SET PunchTime = DATEADD(MINUTE, 330, PunchTime)
--   WHERE Source IN ('CSV','MANUAL');
--   SELECT @@ROWCOUNT AS RowsFixed;
-- COMMIT;
-- After committing, recompute:
-- EXEC dbo.sp_ComputeAttendance @FromDate='2026-01-01', @ToDate=CAST(GETDATE() AS DATE);
GO

PRINT '================================================================';
PRINT ' HRnova Database Schema — Ready!';
PRINT ' Tables: 28 | Stored Procs: 3 | Settings: 18 keys';
PRINT '================================================================';
GO
