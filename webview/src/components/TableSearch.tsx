import { useState } from 'react';
import { Input, Select, Space } from 'antd';

export interface SearchCondition {
  column: string | null;
  keyword: string;
}

interface Props {
  columns: string[];
  onSearch: (cond: SearchCondition) => void;
}

const ALL = '__all__';

export default function TableSearch({ columns, onSearch }: Props) {
  const [column, setColumn] = useState<string>(ALL);
  const [keyword, setKeyword] = useState('');

  const trigger = (kw: string) => {
    onSearch({ column: column === ALL ? null : column, keyword: kw });
  };

  return (
    <Space.Compact>
      <Select
        size="small"
        value={column}
        style={{ width: 130 }}
        onChange={setColumn}
        options={[
          { value: ALL, label: '全部字段' },
          ...columns.map((c) => ({ value: c, label: c })),
        ]}
      />
      <Input.Search
        allowClear
        placeholder="搜索关键字"
        style={{ width: 220 }}
        value={keyword}
        onChange={(e) => {
          setKeyword(e.target.value);
          if (e.target.value === '') {
            trigger('');
          }
        }}
        onSearch={(kw) => trigger(kw)}
      />
    </Space.Compact>
  );
}
