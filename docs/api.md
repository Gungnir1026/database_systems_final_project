# API 摘要

所有路徑以 `/api` 開頭，與前端同來源。寫入請求使用 `Content-Type: application/json`。除健康檢查、註冊與登入外，業務 API 需要登入 Cookie。登出可在 session 已過期時呼叫。

錯誤格式為 `{ "success": false, "message": "原因", "error": "原因" }`。常用狀態碼：`400` 欄位或狀態錯誤、`401` 尚未登入、`403` 權限不足、`404` 查無資料、`409` 唯一鍵衝突、`415` 非 JSON 請求、`429` 登入次數過多。新增資源成功使用 `201`。

## 登入與共用資料

| 方法 | 路徑 | 身分／用途 |
| --- | --- | --- |
| GET | `/health` | 公開，資料庫健康檢查 |
| POST | `/register` | 公開，註冊學生、教師或單位 |
| POST | `/login` | 公開，以 `{ username, password }` 登入；username 為帳號 |
| POST | `/logout` | 撤銷目前 session 並清除 Cookie |
| GET | `/me` | 目前登入者及角色 |
| GET | `/scholarships` | 所有登入者，獎學金及提供單位 |
| GET | `/teachers` | 所有登入者，推薦教師選單 |
| GET | `/announcements` | 所有登入者，公告列表 |
| GET | `/providers` | 管理員，含單位聯絡資料 |
| POST | `/announcements` | 管理員，`{ title, content }`，作者由 session 決定 |
| GET | `/application-full-detail/:app_id` | 該學生、指定教師、所屬單位或管理員 |
| GET | `/recommendation/:app_id` | 與該申請有關聯者或管理員 |
| PUT | `/applications/:id/status` | 所屬單位或管理員，`{ status }` |

狀態值只有 `待審核`、`通過`、`不通過`。

## 學生

| 方法 | 路徑 | 請求 |
| --- | --- | --- |
| GET | `/student/profile/:id` | 僅限自己的帳號 |
| PUT | `/student/profile/:id` | `{ username, phone, email, department, academic_year, bank_account, bank_serial_number, password? }` |
| POST | `/student/apply` | `{ scholarship_id, teacher_id, ranking, grade }`，使用 session 的帳號 |
| GET | `/student/applications/:user_id` | 僅限自己的帳號 |

學生成績為 0–100 的整數，排名為正整數；同一獎學金不可重複申請。開始日和截止日當天都可申請。

## 教師

| 方法 | 路徑 | 請求 |
| --- | --- | --- |
| GET / PUT | `/teacher/profile/:id` | 本人的帳號，更新 `{ username, phone, email, department, password? }` |
| GET | `/teacher/applications/:teacher_id` | 本人的教師數字主鍵 |
| GET | `/teacher/recommendation/:app_id/:teacher_id` | 回傳 `{ exists, letter? }` |
| POST | `/teacher/recommendation` | `{ teacher_id, application_id, content }`，限指定教師 |
| PUT | `/teacher/recommendation/:letter_id` | `{ content }`，限原推薦教師 |

## 獎助單位

| 方法 | 路徑 | 請求 |
| --- | --- | --- |
| GET | `/provider-info/:id` | 本人的帳號，組織名稱 |
| GET / PUT | `/provider/profile/:id` | 更新 `{ phone, email, organization_name, contact_person, password? }` |
| GET | `/provider/scholarships/:provider_id` | 本人的**帳號**，包含申請人數 |
| GET | `/provider/applications/:provider_id` | 本人的**帳號**，申請清單 |
| POST | `/scholarships` | `{ title, description, amount, start_date, end_date }`，提供單位由 session 決定 |

## 管理員

| 方法 | 路徑 | 用途 |
| --- | --- | --- |
| GET | `/admin/students` | 學生列表 |
| GET | `/admin/teachers` | 教師列表 |
| GET | `/admin/providers` | 單位列表 |
| GET | `/admin/applications` | 申請列表 |
| GET | `/admin/recommendations` | 推薦信列表 |
| GET | `/admin/closed-scholarships` | 已截止獎學金及申請人數 |
| GET | `/admin/scholarship-results/:id` | 該獎學金的學生審核結果 |
| PUT / DELETE | `/admin/announcement/:id` | 更新 `{ title, content }` 或刪除 |
| PUT / DELETE | `/admin/student/:id` | 更新 `{ username, email, department, student_number }` 或刪除 |
| PUT / DELETE | `/admin/teacher/:id` | 更新 `{ username, email, department, job_title }` 或刪除 |
| PUT / DELETE | `/admin/provider/:id` | 更新 `{ email, phone, organization_name, contact_person }` 或刪除 |
| PUT / DELETE | `/admin/scholarship/:id` | 更新 `{ title, description, scholarship_amount, application_start_date, application_deadline }` 或刪除 |
| DELETE | `/admin/application/:id` | 刪除申請及相關推薦信 |
| DELETE | `/admin/recommendation/:id` | 刪除推薦信 |

管理端 `:id` 皆為各資料表的數字主鍵。舊前端保留的 `?userId=` 參數會被忽略，帳號由角色資料查得。

## 註冊範例

```json
{
  "account": "demo-student",
  "password": "ExamplePass123!",
  "name": "展示學生",
  "phone": "",
  "email": "student@example.com",
  "role": "student",
  "dept": "資訊工程學系",
  "grade": 3,
  "stuID": "DEMO-ST100",
  "bankCode": "",
  "bankAcc": ""
}
```

教師使用 `role: "teacher"` 及 `dept`；單位使用 `role: "unit"`、`dept_unit` 與 `unitContact`。不接受管理員自助註冊。密碼長度為 8–128 字元。修改密碼會撤銷該帳號所有登入工作階段，回傳 `loginRequired: true`。
