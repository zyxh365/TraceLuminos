# APP 端 OpenTelemetry Baggage 业务字段集成方案

> **面向读者**：Android / iOS 开发人员
> **目标**：在 APP 启动时通过 OTel SDK 设置业务 baggage 字段，实现全链路追踪中业务维度的自动透传

## 1. 背景

TSP 自研可观测性平台需要在全链路追踪中携带以下业务维度字段，用于多维度数据分析和问题定位：

| Baggage Key | ClickHouse 列 | 值来源 | 说明 |
|---|---|---|---|
| `biz.platform` | `biz_platform` | 硬编码 `android` / `ios` | 终端类型 |
| `biz.app_version` | `biz_app_version` | 系统 API 读取 | APP 版本号 |
| `biz.channel` | `biz_channel` | 构建时注入 | 业务渠道（chery-app / jetour-app 等） |
| `biz.brand` | `biz_brand` | 构建时注入 | 品牌标识（chery / jetour / icar） |
| `biz.tenant` | `biz_tenant` | 构建时注入 | 租户标识 |

> 注：操作系统版本已由 OTel SDK 自动采集到 `os_version` 列（`ResourceAttributes['os.version']`），无需 APP 手动设置。

## 2. 数据流

```
APP 启动
  │
  ├─ OTel SDK 初始化
  │   └─ 设置 Baggage（5 个 biz.* 字段）
  │
  ├─ HTTP 请求（OkHttp / URLSession）
  │   ├─ OTel 自动注入 traceparent header
  │   ├─ OTel 自动注入 baggage header
  │   └─ → 后端服务
  │         └─ OTel Java Agent（copy-from-baggage.include）
  │               └─ → SpanAttributes
  │                     └─ → ClickHouse tsp_spans 业务列
  │
  └─ 后续可扩展：用户登录后动态更新 biz.user_id、biz.vin
```

## 3. Android 集成

### 3.1 依赖

```groovy
// build.gradle (app module)
dependencies {
    implementation(platform("io.opentelemetry.android:opentelemetry-android-bom:1.3.0"))
    implementation("io.opentelemetry.android:android-agent")
}
```

Android Agent 已内置 OkHttp 自动插桩，无需额外依赖。

### 3.2 构建变体配置（注入 channel / brand / tenant）

```groovy
// build.gradle (app module)
android {
    flavorDimensions "brand"
    productFlavors {
        chery {
            dimension "brand"
            buildConfigField "String", "CHANNEL", "\"chery-app\""
            buildConfigField "String", "BRAND", "\"chery\""
            buildConfigField "String", "TENANT", "\"tsp-chery\""
        }
        jetour {
            dimension "brand"
            buildConfigField "String", "CHANNEL", "\"jetour-app\""
            buildConfigField "String", "BRAND", "\"jetour\""
            buildConfigField "String", "TENANT", "\"tsp-jetour\""
        }
        icar {
            dimension "brand"
            buildConfigField "String", "CHANNEL", "\"icar-app\""
            buildConfigField "String", "BRAND", "\"icar\""
            buildConfigField "String", "TENANT", "\"tsp-icar\""
        }
    }
}
```

### 3.3 Application 初始化

```java
import android.app.Application;
import io.opentelemetry.android.OpenTelemetryRum;
import io.opentelemetry.android.config.OtelRumConfig;
import io.opentelemetry.android.config.SessionConfig;
import io.opentelemetry.api.baggage.Baggage;
import io.opentelemetry.context.Context;
import io.opentelemetry.sdk.resources.Resource;

public class MyApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();

        // 1. 构建业务 baggage
        Baggage baggage = Baggage.builder()
                .put("biz.platform", "android")
                .put("biz.app_version", BuildConfig.VERSION_NAME)
                .put("biz.channel", BuildConfig.CHANNEL)
                .put("biz.brand", BuildConfig.BRAND)
                .put("biz.tenant", BuildConfig.TENANT)
                .build();

        // 2. 在 OTel 上下文中设置 baggage，后续所有 Span 自动携带
        Context.current().with(baggage).makeCurrent();

        // 3. 初始化 OTel Android Agent
        OtelRumConfig config = OtelRumConfig.builder()
                .setResource(Resource.builder()
                        .put("service.name", getPackageName())
                        .build())
                .setSessionConfig(SessionConfig.builder()
                        .setSessionTimeout(15, java.util.concurrent.TimeUnit.MINUTES)
                        .build())
                .build();

        OpenTelemetryRum.initialize(config, this);
    }
}
```

### 3.4 OTLP Exporter 配置

如需自定义上报地址，在 `AndroidManifest.xml` 中添加：

```xml
<meta-data
    android:name="io.opentelemetry.android.otlp.traces.endpoint"
    android:value="http://<collector-host>:4318/v1/traces" />
```

## 4. iOS 集成

### 4.1 依赖（Swift Package Manager）

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/open-telemetry/opentelemetry-swift-core", from: "2.3.0"),
    .package(url: "https://github.com/open-telemetry/opentelemetry-swift", from: "2.3.0"),
],
targets: [
    .target(name: "YourApp", dependencies: [
        .product(name: "OpenTelemetryApi", package: "opentelemetry-swift-core"),
        .product(name: "OpenTelemetrySdk", package: "opentelemetry-swift-core"),
        .product(name: "OpenTelemetryProtocolExporter", package: "opentelemetry-swift"),
        .product(name: "URLSessionInstrumentation", package: "opentelemetry-swift"),
    ]),
]
```

### 4.2 构建配置（注入 channel / brand / tenant）

通过 xcconfig + Info.plist 实现多渠道构建：

```
// Brand-chery.xcconfig
CHANNEL = chery-app
BRAND = chery
TENANT = tsp-chery
```

```xml
<!-- Info.plist -->
<key>OTEL_CHANNEL</key>
<string>$(CHANNEL)</string>
<key>OTEL_BRAND</key>
<string>$(BRAND)</string>
<key>OTEL_TENANT</key>
<string>$(TENANT)</string>
```

### 4.3 AppDelegate 初始化

```swift
import UIKit
import OpenTelemetryApi
import OpenTelemetrySdk
import OpenTelemetryProtocolExporter
import URLSessionInstrumentation

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

        // 1. 读取构建配置
        let channel = Bundle.main.infoDictionary?["OTEL_CHANNEL"] as? String ?? "unknown"
        let brand = Bundle.main.infoDictionary?["OTEL_BRAND"] as? String ?? "unknown"
        let tenant = Bundle.main.infoDictionary?["OTEL_TENANT"] as? String ?? "unknown"
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"

        // 2. 构建业务 baggage
        let baggage = DefaultBaggage.baggageBuilder()
            .put(key: "biz.platform", value: "ios")
            .put(key: "biz.app_version", value: appVersion)
            .put(key: "biz.channel", value: channel)
            .put(key: "biz.brand", value: brand)
            .put(key: "biz.tenant", value: tenant)
            .build()

        // 3. 设置 OTel 全局上下文
        OpenTelemetry.registerPropagators(
            textPropagators: [
                W3CTraceContextPropagator(),
                W3CBaggagePropagator()
            ]
        )

        // 4. 将 baggage 注入全局上下文
        let context = OpenTelemetry.instance.contextProvider.activeContext
            .withBaggage(baggage)
        OpenTelemetry.instance.contextProvider.setActiveContext(context)

        // 5. 配置 OTLP exporter
        let exporter = OtlpHttpTraceExporter(
            endpoint: URL(string: "http://<collector-host>:4318/v1/traces")!
        )

        let processor = SimpleSpanProcessor(spanExporter: exporter)
        OpenTelemetry.registerTracerProvider(
            tracerProvider: TracerProviderBuilder()
                .add(spanProcessor: processor)
                .build()
        )

        // 6. 启用 URLSession 自动插桩
        URLSessionInstrumentation.enable()

        return true
    }
}
```

## 5. 验证方法

### 5.1 抓包验证

发起一次 HTTP 请求，检查请求头是否包含：

```
traceparent: 00-<trace-id>-<span-id>-01
baggage: biz.platform=android,biz.app_version=1.2.3,biz.channel=chery-app,biz.brand=chery,biz.tenant=tsp-chery
```

### 5.2 后端验证

1. 在监控平台页面搜索该 `trace-id`
2. 点击 Span 详情，查看 `SpanAttributes` 中是否包含 6 个 `biz.*` 字段

### 5.3 ClickHouse 验证

```sql
SELECT trace_id, biz_platform, biz_app_version, biz_channel, biz_brand, biz_tenant, os_version
FROM platform.tsp_spans
WHERE biz_platform IN ('android', 'ios')
ORDER BY start_time DESC
LIMIT 10;
```

## 6. 注意事项

1. **channel / brand / tenant 应用打包时注入**，不同渠道 / 品牌的安装包编译后自带对应值，用户不可修改
2. **platform / app_version 由 APP 运行时自动读取**，无需手动配置；操作系统版本由 OTel SDK 自动采集到 `os_version`
3. **biz.user_id、biz.vin 后续动态设置**：用户登录后通过 OTel API 更新 baggage 中的这两个字段，无需 APP 重启
4. **Android Agent 已内置 OkHttp 插桩**，自定义 OkHttpClient 也能自动携带 header
5. **iOS URLSessionInstrumentation 拦截所有 URLSession 请求**，包括第三方库的请求
