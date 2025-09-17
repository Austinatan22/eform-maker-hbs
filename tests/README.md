# Testing Guide for EForm Maker

This guide explains the comprehensive testing strategy implemented for the EForm Maker project.

## Testing Strategy

We use a **testing pyramid** approach with three levels:

1. **Unit Tests** (70% of tests) - Fast, isolated tests for individual functions
2. **Integration Tests** (20% of tests) - Test component interactions and API endpoints
3. **End-to-End Tests** (10% of tests) - Test complete user workflows

## Test Structure

```
tests/
├── unit/                    # Unit tests for services, utilities
│   ├── validation.service.test.js
│   ├── forms.service.test.js
│   └── password.service.test.js
├── integration/             # Integration tests for API endpoints
│   ├── forms.api.test.js
│   ├── auth.api.test.js
│   └── users.api.test.js
├── e2e/                     # End-to-end workflow tests
│   ├── form-workflow.test.js
│   └── user-workflow.test.js
├── utils/                   # Test utilities and helpers
│   └── test-helpers.js
├── setup.js                 # Jest setup configuration
└── run-tests.js            # Legacy integration tests
```

## Running Tests

### All Tests
```bash
npm test                    # Run all Jest tests
npm run test:all           # Run unit + integration tests
```

### Specific Test Types
```bash
npm run test:unit          # Unit tests only
npm run test:integration   # Legacy integration tests
npm run test:coverage      # Run with coverage report
npm run test:watch         # Watch mode for development
```

### Individual Test Files
```bash
npx jest tests/unit/validation.service.test.js
npx jest tests/integration/forms.api.test.js
```

## Test Categories

### Unit Tests
- **Purpose**: Test individual functions and modules in isolation
- **Speed**: Very fast (milliseconds)
- **Scope**: Single function or class
- **Mocking**: Heavy use of mocks for dependencies

**Example**:
```javascript
describe('Validation Service', () => {
  it('should validate required text field', () => {
    const field = { type: 'singleLine', label: 'Name', required: true };
    const result = validationService.validateFormField(field);
    expect(result.isValid).toBe(true);
  });
});
```

### Integration Tests
- **Purpose**: Test API endpoints and component interactions
- **Speed**: Medium (seconds)
- **Scope**: Multiple components working together
- **Mocking**: Minimal mocking, use test databases

**Example**:
```javascript
describe('Forms API', () => {
  it('should create a new form successfully', async () => {
    const response = await request(app)
      .post('/api/forms')
      .send(formData)
      .expect(200);
    
    expect(response.body.ok).toBe(true);
  });
});
```

### End-to-End Tests
- **Purpose**: Test complete user workflows
- **Speed**: Slow (tens of seconds)
- **Scope**: Full application stack
- **Mocking**: No mocking, use real databases

**Example**:
```javascript
describe('Form Workflow', () => {
  it('should handle complete form lifecycle', async () => {
    // Create form -> Submit data -> Verify -> Delete
    const form = await createForm();
    await submitData(form.id);
    await verifySubmission(form.id);
    await deleteForm(form.id);
  });
});
```

## Test Utilities

### Test Data Factories
```javascript
import { testData } from '../utils/test-helpers.js';

const formData = testData.createFormData({
  title: 'Custom Form',
  fields: [...]
});
```

### Database Helpers
```javascript
import { dbHelpers } from '../utils/test-helpers.js';

const { form, fields } = await dbHelpers.createTestForm();
await dbHelpers.cleanupTestData();
```

### Assertion Helpers
```javascript
import { assertions } from '../utils/test-helpers.js';

assertions.expectValidForm(response.body.form);
assertions.expectApiSuccess(response);
```

## Best Practices

### 1. Test Naming
- Use descriptive test names that explain the scenario
- Follow pattern: "should [expected behavior] when [condition]"

### 2. Test Structure (AAA Pattern)
```javascript
it('should validate email field', () => {
  // Arrange
  const field = { type: 'email', name: 'email' };
  
  // Act
  const result = validationService.validateFormField(field);
  
  // Assert
  expect(result.isValid).toBe(true);
});
```

### 3. Test Isolation
- Each test should be independent
- Clean up test data between tests
- Use unique test data to avoid conflicts

### 4. Mocking Strategy
- **Unit Tests**: Mock all external dependencies
- **Integration Tests**: Use real databases, mock external APIs
- **E2E Tests**: Use real everything

### 5. Error Testing
- Test both success and failure scenarios
- Test edge cases and boundary conditions
- Test error messages and status codes

## Development Workflow

### 1. Test-Driven Development (TDD)
1. **Red**: Write a failing test
2. **Green**: Write minimal code to pass
3. **Refactor**: Improve code while keeping tests green

### 2. Continuous Testing
- Run unit tests on every save (watch mode)
- Run integration tests before commits
- Run full test suite in CI/CD

### 3. Test Coverage
- Aim for 70%+ code coverage
- Focus on critical business logic
- Don't test trivial getters/setters

## Debugging Tests

### Common Issues
1. **Database conflicts**: Ensure test databases are isolated
2. **Async timing**: Use proper async/await or waitFor helpers
3. **Mock issues**: Verify mocks are properly configured

### Debug Commands
```bash
# Run single test with verbose output
npx jest tests/unit/validation.service.test.js --verbose

# Run tests with debugging
node --inspect-brk node_modules/.bin/jest --runInBand

# Run tests with coverage
npm run test:coverage
```

## CI/CD Integration

Tests are designed to run in CI/CD environments:
- No external dependencies
- Isolated test databases
- Deterministic results
- Fast execution

## Performance Considerations

- Unit tests should run in < 100ms each
- Integration tests should run in < 1s each
- E2E tests should run in < 10s each
- Total test suite should complete in < 2 minutes

## Maintenance

- Review and update tests when changing APIs
- Remove obsolete tests
- Keep test data factories up to date
- Monitor test performance and optimize slow tests
