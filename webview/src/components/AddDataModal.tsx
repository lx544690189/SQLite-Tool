import { useMemo, useState } from 'react';
import { Checkbox, Form, Input, InputNumber, Modal, Tag, Tooltip } from 'antd';

interface Props {
  open: boolean;
  tableName: string;
  schema: any[];
  onCancel: () => void;
  onOk: (data: Record<string, any>) => void;
}

function isNumeric(type: string): boolean {
  return ['INTEGER', 'REAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].includes((type || '').toUpperCase());
}

/** INTEGER 主键自增，无需用户填写 */
function isAutoPk(col: any): boolean {
  return col.pk > 0 && (col.type || '').toUpperCase() === 'INTEGER';
}

export default function AddDataModal({ open, tableName, schema, onCancel, onOk }: Props) {
  const [form] = Form.useForm();
  const [nullFields, setNullFields] = useState<Record<string, boolean>>({});

  const editableCols = useMemo(() => schema.filter((c) => !isAutoPk(c)), [schema]);

  const handleOk = async () => {
    const values = await form.validateFields();
    const data: Record<string, any> = {};
    for (const col of editableCols) {
      data[col.name] = nullFields[col.name] ? null : values[col.name];
    }
    onOk(data);
    form.resetFields();
    setNullFields({});
  };

  const handleCancel = () => {
    form.resetFields();
    setNullFields({});
    onCancel();
  };

  return (
    <Modal
      open={open}
      title={`向 ${tableName} 新增行`}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="插入"
      cancelText="取消"
      destroyOnClose
      width={520}
    >
      <Form form={form} layout="vertical" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {editableCols.map((col) => {
          const numeric = isNumeric(col.type);
          const isNull = nullFields[col.name];
          const required = col.notnull === 1 && col.dflt_value === null && !isNull;
          return (
            <Form.Item
              key={col.name}
              label={
                <span style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 6 }}>
                  <span>{col.name}</span>
                  <span style={{ opacity: 0.5, fontSize: 12 }}>{col.type}</span>
                  {col.pk > 0 && <Tag color="gold">PK</Tag>}
                  {col.notnull === 1 && <Tag color="red">NOT NULL</Tag>}
                  <span style={{ flex: 1 }} />
                  <Tooltip title="设为 NULL">
                    <Checkbox
                      checked={isNull}
                      onChange={(e) =>
                        setNullFields((prev) => ({ ...prev, [col.name]: e.target.checked }))
                      }
                    >
                      NULL
                    </Checkbox>
                  </Tooltip>
                </span>
              }
              name={col.name}
              rules={required ? [{ required: true, message: '该字段不可为空' }] : []}
            >
              {numeric ? (
                <InputNumber style={{ width: '100%' }} disabled={isNull} placeholder={isNull ? 'NULL' : ''} />
              ) : (
                <Input disabled={isNull} placeholder={isNull ? 'NULL' : ''} />
              )}
            </Form.Item>
          );
        })}
      </Form>
    </Modal>
  );
}
