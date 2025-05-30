# Codeloops Configuration Guide

This document describes all available configuration options for the Codeloops Event Horizon system.

## Environment Variables

### Core Configuration

#### `CODELOOPS_DATA_DIR`
- **Description**: Override the default data directory location
- **Default**: `./data` (relative to project root)
- **Example**: `CODELOOPS_DATA_DIR=/path/to/custom/data`
- **Usage**: Useful when running codeloops globally with project-specific data

#### `LOG_LEVEL`
- **Description**: Sets the logging verbosity
- **Default**: `info`
- **Options**: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- **Example**: `LOG_LEVEL=debug`

### Google AI / Gemini Configuration

#### `GOOGLE_GENAI_API_KEY` (Required)
- **Description**: API key for Google Generative AI services
- **Required**: Yes, for multi-critic functionality
- **Example**: `GOOGLE_GENAI_API_KEY=your_api_key_here`
- **Note**: Without this key, the system falls back to single-critic mode

#### `GEMINI_CACHE_TTL`
- **Description**: Time-to-live for Gemini context caching (in seconds)
- **Default**: `600` (10 minutes)
- **Example**: `GEMINI_CACHE_TTL=1800` (30 minutes)

#### `GENAI_THINKING_BUDGET`
- **Description**: Token budget for model thinking/reasoning
- **Default**: `500`
- **Example**: `GENAI_THINKING_BUDGET=1000`

### Multi-Critic Temperature Configuration

Temperature controls the randomness of AI responses. Lower values (0.0-0.5) produce more deterministic, focused responses, while higher values (0.5-1.0) produce more creative, varied responses.

#### `CRITIC_TEMP_CORRECTNESS`
- **Description**: Temperature for the correctness critic
- **Default**: `0.3`
- **Range**: `0.0` to `1.0`
- **Recommended**: `0.2-0.4` for code correctness analysis

#### `CRITIC_TEMP_EFFICIENCY`
- **Description**: Temperature for the efficiency critic
- **Default**: `0.4`
- **Range**: `0.0` to `1.0`
- **Recommended**: `0.3-0.5` for performance and design suggestions

#### `CRITIC_TEMP_SECURITY`
- **Description**: Temperature for the security critic
- **Default**: `0.3`
- **Range**: `0.0` to `1.0`
- **Recommended**: `0.2-0.4` for security vulnerability detection

#### `CRITIC_TEMP_DEFAULT`
- **Description**: Default temperature for fallback scenarios
- **Default**: `0.3`
- **Range**: `0.0` to `1.0`

#### `CRITIC_MAX_TOKENS`
- **Description**: Maximum tokens for critic responses
- **Default**: `6000`
- **Example**: `CRITIC_MAX_TOKENS=3000`

### Optional Integration Configuration

#### `OLLAMA_BASE_URL`
- **Description**: Base URL for Ollama API endpoint
- **Default**: Not set
- **Example**: `OLLAMA_BASE_URL=http://localhost:11434`

#### `FASTAGENT_BASE_URL`
- **Description**: Base URL for fast-agent endpoint
- **Default**: Not set
- **Example**: `FASTAGENT_BASE_URL=http://localhost:8000`

## Configuration Examples

### Development Configuration
```bash
# .env.development
LOG_LEVEL=debug
GOOGLE_GENAI_API_KEY=your_dev_key_here
GEMINI_CACHE_TTL=300
CRITIC_TEMP_CORRECTNESS=0.3
CRITIC_TEMP_EFFICIENCY=0.4
CRITIC_TEMP_SECURITY=0.3
```

### Production Configuration
```bash
# .env.production
LOG_LEVEL=info
GOOGLE_GENAI_API_KEY=your_prod_key_here
GEMINI_CACHE_TTL=1800
CRITIC_TEMP_CORRECTNESS=0.2
CRITIC_TEMP_EFFICIENCY=0.3
CRITIC_TEMP_SECURITY=0.2
CRITIC_MAX_TOKENS=2500
```

### Testing Configuration
```bash
# .env.test
LOG_LEVEL=warn
GOOGLE_GENAI_API_KEY=your_test_key_here
GEMINI_CACHE_TTL=60
CRITIC_TEMP_DEFAULT=0.1
GENAI_THINKING_BUDGET=100
```

## Temperature Guidelines

### When to Use Lower Temperatures (0.0-0.3)
- Code correctness verification
- Security vulnerability detection
- Syntax and logic validation
- Deterministic test generation

### When to Use Medium Temperatures (0.3-0.5)
- Design pattern suggestions
- Performance optimization ideas
- Code refactoring proposals
- Architecture recommendations

### When to Use Higher Temperatures (0.5-0.7)
- Creative problem solving
- Alternative implementation ideas
- Exploratory design discussions
- Brainstorming sessions

### Temperature Validation
The system automatically validates and clamps temperature values:
- Values below 0.0 are set to 0.0
- Values above 1.0 are set to 1.0
- Invalid values default to 0.3
- Warnings are logged for out-of-range values

## Best Practices

1. **API Key Security**: Never commit API keys to version control. Use environment variables or secure key management systems.

2. **Temperature Tuning**: Start with default values and adjust based on the quality of critic feedback. Lower temperatures generally work better for code review tasks.

3. **Cache TTL**: Set based on your workflow. Longer TTL reduces API calls but may miss recent context changes.

4. **Token Budgets**: Balance between comprehensive analysis and cost. Higher token budgets allow more detailed feedback but increase API costs.

5. **Logging Levels**: Use `debug` for development, `info` for production, and `error` for minimal logging.

## Troubleshooting

### Multi-Critic Fallback to Single Critic
**Symptoms**: Only one critic provides feedback instead of three
**Common Causes**:
- Missing `GOOGLE_GENAI_API_KEY`
- Invalid API key
- Network connectivity issues
- Rate limiting

**Solution**: Check logs for specific error messages and ensure API key is valid.

### Temperature Not Taking Effect
**Symptoms**: Critic responses seem too random or too rigid
**Common Causes**:
- Temperature value out of range
- Environment variable not set correctly
- Typo in variable name

**Solution**: Check logs for temperature validation warnings and verify environment variables.

### Performance Issues
**Symptoms**: Slow critic responses
**Common Causes**:
- High token budget
- Network latency
- Cold cache

**Solution**: Reduce `CRITIC_MAX_TOKENS` or increase `GEMINI_CACHE_TTL` for frequently accessed content.