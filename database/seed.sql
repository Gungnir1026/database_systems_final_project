-- Fictional demonstration data only. Shared demo password: DemoPass123!
SET NAMES utf8mb4;

INSERT INTO Users (id, username, password_hash, phone_number, email, role) VALUES
('admin','展示管理員','scrypt$71a082cce722435c21ffd26d90ec67bf$dddfab9a6bc39a6f910461aca736bed59f2e6f5efea61b4bb8fe025792dd04862458904ee15e304f109b7e2656766f9edb7eaadf564854e2cb515d79f84368b1','','admin@example.com','管理員'),
('01','陳同學','scrypt$71a082cce722435c21ffd26d90ec67bf$dddfab9a6bc39a6f910461aca736bed59f2e6f5efea61b4bb8fe025792dd04862458904ee15e304f109b7e2656766f9edb7eaadf564854e2cb515d79f84368b1','','01@example.com','學生'),
('02','林教授','scrypt$71a082cce722435c21ffd26d90ec67bf$dddfab9a6bc39a6f910461aca736bed59f2e6f5efea61b4bb8fe025792dd04862458904ee15e304f109b7e2656766f9edb7eaadf564854e2cb515d79f84368b1','','02@example.com','老師'),
('03','晨光教育基金會','scrypt$71a082cce722435c21ffd26d90ec67bf$dddfab9a6bc39a6f910461aca736bed59f2e6f5efea61b4bb8fe025792dd04862458904ee15e304f109b7e2656766f9edb7eaadf564854e2cb515d79f84368b1','','03@example.com','獎助單位'),
('04','李同學','scrypt$71a082cce722435c21ffd26d90ec67bf$dddfab9a6bc39a6f910461aca736bed59f2e6f5efea61b4bb8fe025792dd04862458904ee15e304f109b7e2656766f9edb7eaadf564854e2cb515d79f84368b1','','04@example.com','學生'),
('05','周同學','scrypt$71a082cce722435c21ffd26d90ec67bf$dddfab9a6bc39a6f910461aca736bed59f2e6f5efea61b4bb8fe025792dd04862458904ee15e304f109b7e2656766f9edb7eaadf564854e2cb515d79f84368b1','','05@example.com','學生'),
('06','吳教授','scrypt$71a082cce722435c21ffd26d90ec67bf$dddfab9a6bc39a6f910461aca736bed59f2e6f5efea61b4bb8fe025792dd04862458904ee15e304f109b7e2656766f9edb7eaadf564854e2cb515d79f84368b1','','06@example.com','老師'),
('07','星河公益基金會','scrypt$71a082cce722435c21ffd26d90ec67bf$dddfab9a6bc39a6f910461aca736bed59f2e6f5efea61b4bb8fe025792dd04862458904ee15e304f109b7e2656766f9edb7eaadf564854e2cb515d79f84368b1','','07@example.com','獎助單位'),
('08','黃教授','scrypt$71a082cce722435c21ffd26d90ec67bf$dddfab9a6bc39a6f910461aca736bed59f2e6f5efea61b4bb8fe025792dd04862458904ee15e304f109b7e2656766f9edb7eaadf564854e2cb515d79f84368b1','','08@example.com','老師');

INSERT INTO Student (user_id, department, academic_year, student_number, bank_serial_number, bank_account) VALUES
('01','資訊工程學系',3,'DEMO-ST001','',''),
('04','電機工程學系',2,'DEMO-ST002','',''),
('05','土木工程學系',1,'DEMO-ST003','','');
INSERT INTO Teacher (user_id, department, job_title) VALUES
('02','資訊工程學系','教授'),('06','電機工程學系','副教授'),('08','土木工程學系','助理教授');
INSERT INTO Scholarship_Provider (user_id, organization_name, contact_person) VALUES
('03','晨光教育基金會','展示聯絡人甲'),('07','星河公益基金會','展示聯絡人乙');

-- Relative dates keep a fresh installation useful whenever it is first launched.
INSERT INTO Scholarship (title, description, scholarship_amount, application_start_date, application_deadline, provider_id) VALUES
('優秀學生獎學金','鼓勵學業表現優異，並積極參與校園活動的學生。此為虛構展示資料。',12000,DATE_SUB(CURDATE(), INTERVAL 10 DAY),DATE_ADD(CURDATE(), INTERVAL 30 DAY),'03'),
('勤學助學金','支持持續學習與投入社會服務的學生，請填寫成績及推薦教師。',8000,DATE_SUB(CURDATE(), INTERVAL 5 DAY),DATE_ADD(CURDATE(), INTERVAL 45 DAY),'07'),
('學期進步獎學金','本梯次已截止，可由管理員查看審查結果並產生公告。',6000,DATE_SUB(CURDATE(), INTERVAL 60 DAY),DATE_SUB(CURDATE(), INTERVAL 5 DAY),'07');
INSERT INTO Application (ranking, grade, status, application_date, user_id, scholarship_id, teacher_id) VALUES
(5,92,'待審核',DATE_SUB(CURDATE(), INTERVAL 3 DAY),'01',1,1),
(12,85,'待審核',DATE_SUB(CURDATE(), INTERVAL 2 DAY),'04',2,2),
(3,95,'通過',DATE_SUB(CURDATE(), INTERVAL 15 DAY),'05',3,3),
(20,70,'不通過',DATE_SUB(CURDATE(), INTERVAL 12 DAY),'01',3,1);
INSERT INTO Recommendation_Letter (teacher_id, content, submission_date, application_id) VALUES
(1,'此為展示推薦信：該生主動參與專題研究，具備良好學習態度與團隊合作能力。',DATE_SUB(CURDATE(), INTERVAL 1 DAY),1),
(3,'此為展示推薦信：該生本學期表現進步，能持續完成研究與實作任務，予以推薦。',DATE_SUB(CURDATE(), INTERVAL 10 DAY),3);
INSERT INTO Announcement (announcement_date, TITLE, CONTENT, user_id) VALUES
(CURDATE(),'新學期獎學金開放申請','歡迎使用獎學金管理系統。請先確認個人學籍資料，再選擇開放申請的獎學金及推薦教師。','admin'),
(DATE_SUB(CURDATE(), INTERVAL 1 DAY),'展示操作說明','本系統包含學生、教師、獎助單位及管理員四種角色。所有帳號及申請內容皆為虛構展示資料。','admin');
