# Form CRUD Operations Test Suite

This comprehensive test suite covers all Form CRUD (Create, Read, Update, Delete) operations for the EForm-Maker application. The tests are designed to validate the intended behavior rather than assuming current app behavior is correct.

## 📁 Test Files

- **`forms-crud.test.js`** - Core CRUD operations (Create, Read, List)
- **`forms-crud-update-delete.test.js`** - Update, Delete, and advanced validation tests

## 🎯 Test Coverage

### **Priority 2: Form CRUD Operations** ⭐⭐⭐

#### ✅ **Create Form Operations**
- **Create form with valid data** - Tests successful form creation with fields and category
- **Create form with duplicate title** - Ensures case-insensitive title uniqueness
- **Create form with empty title** - Validates required field validation
- **Create form with invalid field data** - Tests field validation rules
- **Create form with duplicate field names** - Ensures field name uniqueness within form
- **Authentication requirements** - Tests auth and role-based access control

#### ✅ **Read Form Operations**
- **Read form by ID** - Tests retrieving form with fields and category
- **Read non-existent form** - Returns proper 404 error
- **List forms with pagination** - Tests ordering and data structure
- **Include form fields and category** - Validates complete data retrieval
- **Authentication requirements** - Tests auth and viewer access

#### ✅ **Update Form Operations**
- **Update form title** - Tests title modification with uniqueness validation
- **Update form fields** - Tests complete field replacement
- **Update form category** - Tests category assignment
- **Update with duplicate title** - Ensures uniqueness on updates
- **Update non-existent form** - Returns proper 404 error
- **Authentication requirements** - Tests auth and role-based access

#### ✅ **Delete Form Operations**
- **Delete form and cascade cleanup** - Tests complete deletion with dependencies
- **Delete form with submissions** - Ensures submissions are also deleted
- **Delete non-existent form** - Returns proper 404 error
- **Authentication requirements** - Tests auth and role-based access

#### ✅ **Form Field Validation**
- **All 16 supported field types** - Tests every field type (singleLine, paragraph, dropdown, etc.)
- **Choice field options validation** - Tests dropdown, radio, checkbox options
- **Field name format rules** - Tests naming conventions (letters, numbers, underscores)
- **Field name uniqueness** - Ensures no duplicate names within form
- **HTML sanitization** - Tests XSS prevention in titles and labels

#### ✅ **Form Title Uniqueness**
- **Case-insensitive uniqueness** - Tests "Test Form" vs "TEST FORM" conflict
- **Update with same title** - Allows updating form with same title (excludes self)

## 🔧 **Test Structure**

### **Database Setup**
- Uses isolated test databases (`test-{timestamp}.sqlite`)
- Creates test models with proper associations
- Cleans up after each test run
- Supports both main and submissions databases

### **Authentication & Authorization**
- Tests with three user roles: `admin`, `editor`, `viewer`
- JWT token-based authentication
- Role-based access control validation
- Session-based authentication support

### **Test Data Factory**
- Creates test users with different roles
- Generates test categories
- Creates test forms with various configurations
- Supports test submissions for cascade testing

## 🚀 **Running the Tests**

### **Individual Test Files**
```bash
# Run core CRUD tests
npx jest tests/routes/forms-crud.test.js --verbose

# Run update/delete tests
npx jest tests/routes/forms-crud-update-delete.test.js --verbose
```

### **All Form CRUD Tests**
```bash
# Run all form CRUD tests
npx jest tests/routes/forms-crud*.test.js --verbose

# Or use the test runner
node tests/run-form-crud-tests.js
```

### **With Coverage**
```bash
npx jest tests/routes/forms-crud*.test.js --coverage
```

## 📋 **Test Scenarios**

### **Happy Path Tests**
- ✅ Create form with valid data
- ✅ Read form by ID
- ✅ Update form title and fields
- ✅ Delete form with cascade cleanup
- ✅ List all forms with proper ordering

### **Validation Tests**
- ✅ Empty title validation
- ✅ Duplicate title prevention (case-insensitive)
- ✅ Field type validation (all 16 types)
- ✅ Field name format validation
- ✅ Field name uniqueness
- ✅ Choice field options validation
- ✅ HTML sanitization (XSS prevention)

### **Error Handling Tests**
- ✅ Non-existent form (404 errors)
- ✅ Invalid field data (400 errors)
- ✅ Duplicate titles (409 errors)
- ✅ Authentication failures (401 errors)
- ✅ Authorization failures (403 errors)

### **Security Tests**
- ✅ Authentication requirements
- ✅ Role-based access control
- ✅ HTML sanitization
- ✅ Input validation
- ✅ SQL injection prevention (through ORM)

## 🎯 **Intended Behavior Validation**

The tests validate the **intended behavior** rather than current implementation:

1. **Form Creation**: Should create forms with unique IDs, validate all fields, and enforce title uniqueness
2. **Form Reading**: Should return complete form data with fields and category information
3. **Form Updates**: Should allow partial updates while maintaining data integrity
4. **Form Deletion**: Should cascade delete all related data (fields, submissions)
5. **Field Validation**: Should enforce all validation rules for field types and names
6. **Security**: Should prevent XSS, enforce authentication, and validate all inputs

## 🔍 **Test Assertions**

Each test includes comprehensive assertions:
- **Response status codes** (200, 400, 401, 403, 404, 409, 500)
- **Response body structure** (ok, form, fields, error messages)
- **Database state verification** (form exists, fields created, submissions deleted)
- **Data integrity** (field positions, required flags, options)
- **Security validation** (sanitized HTML, proper auth)

## 📊 **Expected Results**

When all tests pass, you should see:
- **~50+ individual test cases** covering all CRUD operations
- **100% success rate** for all intended behaviors
- **Comprehensive coverage** of validation, security, and error handling
- **Clean test isolation** with no side effects between tests

## 🚨 **Common Issues**

### **Database Connection Issues**
- Ensure test databases are created in `data/` directory
- Check that SQLite files are writable
- Verify foreign key constraints are properly handled

### **Authentication Issues**
- Ensure `AUTH_ENABLED=1` is set in test environment
- Verify JWT secret is consistent between test setup and routes
- Check that test users are created with proper roles

### **Model Association Issues**
- Verify all model associations are properly defined
- Check that foreign key relationships are correct
- Ensure test models match production model structure

## 📝 **Adding New Tests**

When adding new Form CRUD tests:

1. **Follow the existing structure** with clear describe/it blocks
2. **Test intended behavior** not current implementation
3. **Include both success and failure scenarios**
4. **Validate database state** after operations
5. **Test authentication and authorization**
6. **Include proper cleanup** in beforeEach/afterEach

## 🎉 **Success Criteria**

The Form CRUD test suite is complete when:
- ✅ All CRUD operations work correctly
- ✅ All validation rules are enforced
- ✅ All security measures are in place
- ✅ All error conditions are handled properly
- ✅ Database integrity is maintained
- ✅ Authentication and authorization work correctly

---

**Last Updated**: 2025-01-19  
**Test Files**: 2  
**Total Test Cases**: 50+  
**Coverage**: Form CRUD Operations (Priority 2) - 100% Complete
