# OvertureMaps 的全球轨道交通数据可视化

数据来自 OvertureMaps 2026-04-15.0 的 Release，同步到本地后从 transportation 和 places 提取数据打包制作的 pmtiles 文件:

```
https://dataset.ringsaturn.me/pmtiles/global_rail.pmtiles
```

不保证数据的可用性、准确性、稳定性和更新频率。

## 数据处理

前置准备，需要安装：

- uv
- tippecanoe
- aws-cli: 上传到 R2 的 S3 兼容对象存储

```bash
SOURCE_DIR=./data/2026-04-15.0/transportation uv run scripts/build_global_rail_pmtiles.py

# 参考 .env.exmaple 配置 R2 开头的环境变量
bash upload.sh
```

## 许可证

本项目 MIT，二次加工的数据文件遵循 [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/) 许可证。
