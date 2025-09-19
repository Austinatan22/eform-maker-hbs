# EForm-Maker Test Suite Development Plan

## 🎯 **CRITICAL CORE FUNCTIONALITY** (Must Test First)

### **Priority 1: Authentication & Security** ⭐⭐⭐
- [ ] **User login with valid credentials**
- [ ] **User login with invalid credentials** 
- [ ] **Account lockout after failed attempts**
- [ ] **JWT token validation (Bearer auth)**
- [ ] **Session management (login/logout)**
- [ ] **Role-based access control (admin/editor/viewer)**
- [ ] **Unauthorized access attempts**
- [ ] **Password hashing verification**

### **Priority 2: Form CRUD Operations** ⭐⭐⭐
- [ ] **Create form with valid data**
- [ ] **Create form with duplicate title (should fail)**
- [ ] **Read form by ID**
- [ ] **Read non-existent form (should return 404)**
- [ ] **Update form title and fields**
- [ ] **Delete form and cascade cleanup**
- [ ] **List forms with pagination**

### **Priority 3: Database Models & Relationships** ⭐⭐⭐
- [ ] **User model creation and validation**
- [ ] **Form model with proper relationships**
- [ ] **FormField model with all field types**
- [ ] **Form → FormField relationship integrity**
- [ ] **Category model and relationships**
- [ ] **Database constraint violations**

### **Priority 4: Input Validation & Sanitization** ⭐⭐⭐
- [ ] **Form title validation (required, length, uniqueness)**
- [ ] **Field name validation (format, uniqueness within form)**
- [ ] **Field type validation (all 16 supported types)**
- [ ] **Options validation for choice fields**
- [ ] **HTML sanitization (XSS prevention)**
- [ ] **Email/URL/Phone validation**

## 🔧 **HIGH PRIORITY** (Core Business Logic)

### **Priority 5: Form Field Management** ⭐⭐
- [ ] **Create fields of all 16 types**
- [ ] **Field positioning and reordering**
- [ ] **Required vs optional field handling**
- [ ] **DoNotStore flag functionality**
- [ ] **Field name uniqueness within form**
- [ ] **Options validation for dropdown/radio/checkbox**

### **Priority 6: Form Submissions** ⭐⭐
- [ ] **Submit form with valid data**
- [ ] **Submit form with missing required fields**
- [ ] **Submit form with invalid data types**
- [ ] **File upload submissions**
- [ ] **Submission storage in separate database**
- [ ] **Retrieve submissions by form ID**

### **Priority 7: Error Handling** ⭐⭐
- [ ] **Database connection errors**
- [ ] **Validation error responses**
- [ ] **Constraint violation handling**
- [ ] **Transaction rollback on errors**
- [ ] **Proper HTTP status codes**

## 📊 **MEDIUM PRIORITY** (Enhanced Features)

### **Priority 8: Categories & Templates** ⭐
- [ ] **Create/update/delete categories**
- [ ] **Category name uniqueness**
- [ ] **Template creation from forms**
- [ ] **Apply templates to new forms**
- [ ] **Template field validation**

### **Priority 9: File Upload & Media** ⭐
- [ ] **File type validation**
- [ ] **File size limits**
- [ ] **File storage and URL generation**
- [ ] **File cleanup on form deletion**

### **Priority 10: Audit Logging** ⭐
- [ ] **User action logging**
- [ ] **Form modification tracking**
- [ ] **Authentication event logging**
- [ ] **Audit log retrieval**

## 🔍 **LOWER PRIORITY** (Monitoring & Integration)

### **Priority 11: API Endpoints** 
- [ ] **REST API response formats**
- [ ] **HTTP method validation**
- [ ] **Rate limiting**
- [ ] **API error handling**

### **Priority 12: Frontend Integration**
- [ ] **Form builder drag & drop**
- [ ] **Form preview functionality**
- [ ] **Hosted form rendering**
- [ ] **Client-side validation**

---

## 🚀 **SUGGESTED IMPLEMENTATION ORDER**

### **Phase 1: Foundation (Week 1)**
1. **Database Models & Relationships** - Set up test database and model tests
2. **Authentication & Security** - Core security functionality
3. **Basic Form CRUD** - Essential form operations

### **Phase 2: Core Features (Week 2)**
4. **Input Validation & Sanitization** - Data integrity
5. **Form Field Management** - Field operations
6. **Form Submissions** - User-facing functionality

### **Phase 3: Robustness (Week 3)**
7. **Error Handling** - Edge cases and failures
8. **Categories & Templates** - Organization features
9. **File Upload & Media** - Extended functionality

### **Phase 4: Monitoring (Week 4)**
10. **Audit Logging** - Observability
11. **API Endpoints** - External interfaces
12. **Frontend Integration** - User experience

---

## 📋 **TEST FILE STRUCTURE**

```
tests/
├── helpers/
│   ├── test-db-setup.js          # Database setup/teardown
│   ├── auth-helpers.js           # Authentication test utilities
│   └── data-factories.js         # Test data generation
├── models/
│   ├── User.test.js              # User model tests
│   ├── Form.test.js              # Form model tests
│   ├── FormField.test.js         # FormField model tests
│   ├── Category.test.js          # Category model tests
│   ├── Template.test.js          # Template model tests
│   ├── FormSubmission.test.js    # FormSubmission model tests
│   └── AuditLog.test.js          # AuditLog model tests
├── services/
│   ├── forms.service.test.js     # Form business logic
│   ├── validation.service.test.js # Input validation
│   ├── submissions.service.test.js # Submission handling
│   ├── audit.service.test.js     # Audit logging
│   └── password.service.test.js  # Password handling
├── routes/
│   ├── auth.routes.test.js       # Authentication endpoints
│   ├── forms.routes.test.js      # Form management endpoints
│   ├── users.routes.test.js      # User management endpoints
│   ├── categories.routes.test.js # Category endpoints
│   ├── templates.routes.test.js  # Template endpoints
│   └── logs.routes.test.js       # Audit log endpoints
└── integration/
    ├── form-lifecycle.test.js    # End-to-end form operations
    ├── user-workflow.test.js     # Complete user workflows
    └── security.test.js          # Security integration tests
```

---

## 🎯 **SUCCESS CRITERIA**

### **Phase 1 Complete When:**
- [ ] All models can be created, read, updated, deleted
- [ ] Authentication works with valid/invalid credentials
- [ ] Basic form CRUD operations work
- [ ] Database relationships are intact

### **Phase 2 Complete When:**
- [ ] All input validation rules work correctly
- [ ] All 16 field types can be created and validated
- [ ] Form submissions work with proper validation
- [ ] Data sanitization prevents XSS/injection

### **Phase 3 Complete When:**
- [ ] Error handling is robust and informative
- [ ] Categories and templates work correctly
- [ ] File uploads work with proper validation
- [ ] System handles edge cases gracefully

### **Phase 4 Complete When:**
- [ ] Audit logging captures all important events
- [ ] API endpoints return proper responses
- [ ] Frontend integration works smoothly
- [ ] System is production-ready

---

## 📝 **NOTES**

- **Test Database**: Use `data/test.sqlite` and `data/test-submissions.sqlite`
- **Environment**: Set `AUTH_ENABLED=1` for security tests
- **Coverage Target**: 80%+ code coverage
- **Performance**: Tests should complete in <30 seconds
- **Maintenance**: Update this file as we progress through implementation

---

**Last Updated**: Initial creation
**Next Review**: After Phase 1 completion
